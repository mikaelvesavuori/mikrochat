import {
  PikoDBProvider as AuthStorageProvider,
  MikroAuth,
  MikroMailProvider
} from 'mikroauth';
import { MikroConf } from 'mikroconf';
import { PikoDB } from 'pikodb';

import type { CombinedConfiguration } from './interfaces';

import { MikroChat } from './MikroChat';
import { startServer } from './Server.js';

import { PikoDBProvider as ChatStorageProvider } from './providers/PikoDBProvider';

import { mikrochatOptions } from './config/mikrochatOptions';

/**
 * @description This starts MikroChat by first wiring up dependencies
 * and then starting a MikroServe instance to serve MikroChat.
 */
async function start() {
  const config = getConfig() as CombinedConfiguration;

  const db = new PikoDB(config.storage);
  await db.start();
  const authStorageProvider = new AuthStorageProvider(db);
  const chatStorageProvider = new ChatStorageProvider(
    db,
    config.storage.encryptionKey || undefined
  );
  const emailProvider = new MikroMailProvider(config.email);

  const auth = new MikroAuth(config, emailProvider, authStorageProvider);
  const chat = new MikroChat(config.chat, chatStorageProvider);

  await startServer({
    config: config.server,
    auth,
    chat,
    devMode: config.devMode,
    isInviteRequired: config.auth.isInviteRequired,
    authMode: config.auth.authMode || 'magic-link',
    oauth: config.oauth
  });
}

function getConfig() {
  const config = new MikroConf(mikrochatOptions).get();

  if (config.auth.debug) console.log('Using configuration:', config);

  return config;
}

start();
