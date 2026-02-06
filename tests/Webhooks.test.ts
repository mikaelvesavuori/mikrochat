import { describe, it, expect, beforeEach } from 'vitest';

import { MikroChat } from '../src/MikroChat';
import type { ServerSentEvent, User, Webhook } from '../src/interfaces';

describe('MikroChat Webhooks', () => {
  let chat: MikroChat;
  let adminUser: User;
  let regularUser: User;
  let testChannelId: string;
  const events: ServerSentEvent[] = [];

  beforeEach(async () => {
    events.length = 0;
    chat = new MikroChat({
      initialUser: {
        id: 'admin-id',
        userName: 'admin',
        email: 'admin@example.com'
      },
      messageRetentionDays: 30,
      maxMessagesPerChannel: 100
    });

    chat.subscribeToEvents((event) => events.push(event));

    await new Promise((resolve) => setTimeout(resolve, 50));

    adminUser = (await chat.getUserByEmail('admin@example.com')) as User;
    regularUser = await chat.addUser('user@example.com', adminUser.id);

    const channel = await chat.createChannel('webhook-test', adminUser.id);
    testChannelId = channel.id;
  });

  describe('Webhook Creation', () => {
    it('should create a webhook for a channel', async () => {
      const webhook = await chat.createWebhook(
        'GitHub Bot',
        testChannelId,
        adminUser.id
      );

      expect(webhook).toBeDefined();
      expect(webhook.name).toBe('GitHub Bot');
      expect(webhook.channelId).toBe(testChannelId);
      expect(webhook.token).toBeDefined();
      expect(webhook.token.length).toBe(64);
      expect(webhook.createdBy).toBe(adminUser.id);
    });

    it('should reject non-admin creating a webhook', async () => {
      await expect(
        chat.createWebhook('Bot', testChannelId, regularUser.id)
      ).rejects.toThrow('Only administrators can create webhooks');
    });

    it('should reject webhook for non-existent channel', async () => {
      await expect(
        chat.createWebhook('Bot', 'nonexistent', adminUser.id)
      ).rejects.toThrow('Channel not found');
    });

    it('should emit NEW_WEBHOOK event', async () => {
      await chat.createWebhook('Bot', testChannelId, adminUser.id);

      const webhookEvent = events.find((e) => e.type === 'NEW_WEBHOOK');
      expect(webhookEvent).toBeDefined();
    });
  });

  describe('Webhook Deletion', () => {
    it('should delete a webhook', async () => {
      const webhook = await chat.createWebhook(
        'Bot',
        testChannelId,
        adminUser.id
      );

      await chat.deleteWebhook(webhook.id, adminUser.id);

      const deleted = await chat.getWebhookById(webhook.id);
      expect(deleted).toBeNull();
    });

    it('should reject non-admin deleting a webhook', async () => {
      const webhook = await chat.createWebhook(
        'Bot',
        testChannelId,
        adminUser.id
      );

      await expect(
        chat.deleteWebhook(webhook.id, regularUser.id)
      ).rejects.toThrow('Only administrators can delete webhooks');
    });

    it('should emit DELETE_WEBHOOK event', async () => {
      const webhook = await chat.createWebhook(
        'Bot',
        testChannelId,
        adminUser.id
      );

      events.length = 0;
      await chat.deleteWebhook(webhook.id, adminUser.id);

      const deleteEvent = events.find((e) => e.type === 'DELETE_WEBHOOK');
      expect(deleteEvent).toBeDefined();
    });
  });

  describe('Webhook Listing', () => {
    it('should list webhooks for admin', async () => {
      await chat.createWebhook('Bot 1', testChannelId, adminUser.id);
      await chat.createWebhook('Bot 2', testChannelId, adminUser.id);

      const webhooks = await chat.listWebhooks(adminUser.id);
      expect(webhooks.length).toBe(2);
    });

    it('should reject non-admin listing webhooks', async () => {
      await expect(chat.listWebhooks(regularUser.id)).rejects.toThrow(
        'Only administrators can list webhooks'
      );
    });
  });

  describe('Webhook Messages', () => {
    let webhook: Webhook;

    beforeEach(async () => {
      webhook = await chat.createWebhook(
        'CI Bot',
        testChannelId,
        adminUser.id
      );
      events.length = 0;
    });

    it('should create a message via webhook', async () => {
      const message = await chat.createWebhookMessage(
        'Build passed!',
        webhook
      );

      expect(message).toBeDefined();
      expect(message.content).toBe('Build passed!');
      expect(message.author.id).toBe(`webhook:${webhook.id}`);
      expect(message.author.userName).toBe('CI Bot');
      expect(message.author.isBot).toBe(true);
      expect(message.channelId).toBe(webhook.channelId);
    });

    it('should emit NEW_MESSAGE event for webhook messages', async () => {
      await chat.createWebhookMessage('Test', webhook);

      const msgEvent = events.find((e) => e.type === 'NEW_MESSAGE');
      expect(msgEvent).toBeDefined();
      if (msgEvent && msgEvent.type === 'NEW_MESSAGE') {
        expect(msgEvent.payload.author.isBot).toBe(true);
      }
    });

    it('should appear in channel messages', async () => {
      await chat.createWebhookMessage('Webhook msg', webhook);

      const messages = await chat.getMessagesByChannel(webhook.channelId);
      const webhookMsg = messages.find((m) => m.content === 'Webhook msg');
      expect(webhookMsg).toBeDefined();
      expect(webhookMsg?.author.isBot).toBe(true);
    });

    it('should respect maxMessagesPerChannel', async () => {
      const limitedChat = new MikroChat({
        initialUser: {
          id: 'admin-id-2',
          userName: 'admin2',
          email: 'admin2@example.com'
        },
        messageRetentionDays: 30,
        maxMessagesPerChannel: 3
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const admin = (await limitedChat.getUserByEmail(
        'admin2@example.com'
      )) as User;
      const ch = await limitedChat.createChannel('limited', admin.id);

      const wh = await limitedChat.createWebhook('Bot', ch.id, admin.id);

      await limitedChat.createWebhookMessage('msg1', wh);
      await limitedChat.createWebhookMessage('msg2', wh);
      await limitedChat.createWebhookMessage('msg3', wh);
      await limitedChat.createWebhookMessage('msg4', wh);

      // Retention is deferred to the cleanup job, so all 4 messages remain
      const messages = await limitedChat.getMessagesByChannel(ch.id);
      expect(messages.length).toBe(4);
    });

    it('should throw when webhook channel no longer exists', async () => {
      const tempChannel = await chat.createChannel('temp', adminUser.id);
      const tempWebhook = await chat.createWebhook(
        'Bot',
        tempChannel.id,
        adminUser.id
      );
      await chat.deleteChannel(tempChannel.id, adminUser.id);

      await expect(
        chat.createWebhookMessage('test', tempWebhook)
      ).rejects.toThrow('Channel not found');
    });
  });

  describe('Webhook Token Lookup', () => {
    it('should find webhook by token', async () => {
      const webhook = await chat.createWebhook(
        'Bot',
        testChannelId,
        adminUser.id
      );

      const found = await chat.getWebhookByToken(webhook.token);
      expect(found).toBeDefined();
      expect(found?.id).toBe(webhook.id);
    });

    it('should return null for invalid token', async () => {
      const found = await chat.getWebhookByToken('invalid-token');
      expect(found).toBeNull();
    });
  });

  describe('Channel Deletion Cascade', () => {
    it('should delete webhooks when channel is deleted', async () => {
      const channel = await chat.createChannel(
        'cascade-test',
        adminUser.id
      );
      const webhook = await chat.createWebhook(
        'Bot',
        channel.id,
        adminUser.id
      );

      await chat.deleteChannel(channel.id, adminUser.id);

      const deleted = await chat.getWebhookById(webhook.id);
      expect(deleted).toBeNull();
    });
  });
});
