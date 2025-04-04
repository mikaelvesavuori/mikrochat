import {
  MikroDBProvider as AuthStorageProvider,
  MikroAuth,
  MikroMailProvider
} from 'mikroauth';
import { MikroConf } from 'mikroconf';
import { MikroDB } from 'mikrodb';

import type { CombinedConfiguration } from './interfaces';

import { MikroChat } from './MikroChat';
import { startServer } from './Server.js';

import { MikroDBProvider as ChatStorageProvider } from './providers/MikroDBProvider';

import { mikrochatOptions } from './config/mikrochatOptions';

/**
 * @description This starts MikroChat by first wiring up dependencies
 * and then starting a MikroServe instance to serve MikroChat.
 */
async function start() {
  const config = getConfig() as CombinedConfiguration;

  const db = new MikroDB(config.storage);
  await db.start();
  const authStorageProvider = new AuthStorageProvider(db);
  const chatStorageProvider = new ChatStorageProvider(db);
  const emailProvider = new MikroMailProvider(config.email);

  const auth = new MikroAuth(config, emailProvider, authStorageProvider);
  const chat = new MikroChat(config.chat, chatStorageProvider);

  await startServer({
    config: config.server,
    auth,
    chat,
    devMode: config.devMode,
    isInviteRequired: config.auth.isInviteRequired
  });
}

function getConfig() {
  const config = new MikroConf(mikrochatOptions).get();

  if (config.auth.debug) console.log('Using configuration:', config);

  return config;
}

start();
