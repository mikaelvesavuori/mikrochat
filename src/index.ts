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
import { addEmailTemplatesToConfig } from './config/addEmailTemplatesToConfig';

/**
 * @description This starts MikroChat by first wiring up dependencies
 * and then starting a MikroServe instance to serve MikroChat.
 */
async function start() {
  const config = getConfig() as CombinedConfiguration;
  const configWithEmailTemplates = addEmailTemplatesToConfig(config);

  const db = new PikoDB(configWithEmailTemplates.storage);
  await db.start();
  const authStorageProvider = new AuthStorageProvider(db);
  const chatStorageProvider = new ChatStorageProvider(
    db,
    configWithEmailTemplates.storage.encryptionKey || undefined
  );
  const authMode = configWithEmailTemplates.auth.authMode || 'magic-link';
  const hasEmailConfig = !!configWithEmailTemplates.email?.host;
  const emailProvider =
    authMode === 'magic-link' || hasEmailConfig
      ? new MikroMailProvider(configWithEmailTemplates.email)
      : undefined;

  const auth = new MikroAuth(
    configWithEmailTemplates,
    emailProvider as any,
    authStorageProvider
  );
  const chat = new MikroChat(
    configWithEmailTemplates.chat,
    chatStorageProvider
  );

  await startServer({
    config: configWithEmailTemplates.server,
    auth,
    chat,
    isInviteRequired: configWithEmailTemplates.auth.isInviteRequired,
    hasEmailConfig,
    authMode,
    appUrl: configWithEmailTemplates.auth.appUrl,
    oauth: configWithEmailTemplates.oauth
  });
}

function getConfig() {
  const config = new MikroConf(mikrochatOptions).get();

  if (config.auth.debug) console.log('Using configuration:', config);

  return config;
}

start();
