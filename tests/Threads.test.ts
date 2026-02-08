import { describe, it, expect, beforeEach } from 'vitest';

import { MikroChat } from '../src/MikroChat';
import type { Message, ServerSentEvent, User } from '../src/interfaces';

describe('MikroChat Threads', () => {
  let chat: MikroChat;
  let adminUser: User;
  let regularUser: User;
  let testChannelId: string;
  let parentMessage: Message;
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

    const channel = await chat.createChannel('thread-test', adminUser.id);
    testChannelId = channel.id;

    parentMessage = await chat.createMessage(
      'Parent message',
      adminUser.id,
      testChannelId
    );
    events.length = 0;
  });

  describe('Thread Reply Creation', () => {
    it('should create a thread reply on a message', async () => {
      const { reply } = await chat.createThreadReply(
        'First reply',
        adminUser.id,
        parentMessage.id
      );

      expect(reply).toBeDefined();
      expect(reply.content).toBe('First reply');
      expect(reply.threadId).toBe(parentMessage.id);
      expect(reply.channelId).toBe(testChannelId);
    });

    it('should update threadMeta on parent message', async () => {
      await chat.createThreadReply('Reply 1', adminUser.id, parentMessage.id);

      const updated = await chat.getMessageById(parentMessage.id);
      expect(updated?.threadMeta).toBeDefined();
      expect(updated?.threadMeta?.replyCount).toBe(1);
      expect(updated?.threadMeta?.lastReplyBy.id).toBe(adminUser.id);
    });

    it('should track multiple participants in threadMeta', async () => {
      await chat.createThreadReply(
        'Admin reply',
        adminUser.id,
        parentMessage.id
      );
      await chat.createThreadReply(
        'User reply',
        regularUser.id,
        parentMessage.id
      );

      const updated = await chat.getMessageById(parentMessage.id);
      expect(updated?.threadMeta?.replyCount).toBe(2);
      expect(updated?.threadMeta?.participants).toContain(adminUser.id);
      expect(updated?.threadMeta?.participants).toContain(regularUser.id);
    });

    it('should not allow threading on a thread reply (no nesting)', async () => {
      const { reply } = await chat.createThreadReply(
        'Reply',
        adminUser.id,
        parentMessage.id
      );

      await expect(
        chat.createThreadReply('Nested reply', adminUser.id, reply.id)
      ).rejects.toThrow('Cannot create a thread on a thread reply');
    });

    it('should throw error for non-existent parent message', async () => {
      await expect(
        chat.createThreadReply('Reply', adminUser.id, 'nonexistent')
      ).rejects.toThrow('Parent message not found');
    });

    it('should throw error for non-existent author', async () => {
      await expect(
        chat.createThreadReply('Reply', 'nonexistent', parentMessage.id)
      ).rejects.toThrow('Author not found');
    });

    it('should emit NEW_THREAD_REPLY event', async () => {
      await chat.createThreadReply('Reply', adminUser.id, parentMessage.id);

      const threadEvent = events.find((e) => e.type === 'NEW_THREAD_REPLY');
      expect(threadEvent).toBeDefined();
      expect(threadEvent?.payload).toMatchObject({
        parentMessageId: parentMessage.id,
        channelId: testChannelId
      });
    });

    it('should create a thread reply with images', async () => {
      const { reply } = await chat.createThreadReply(
        'Reply with images',
        adminUser.id,
        parentMessage.id,
        ['image1.jpg', 'image2.png']
      );

      expect(reply.images).toEqual(['image1.jpg', 'image2.png']);
    });
  });

  describe('Thread Reply Listing', () => {
    it('should list thread replies in order', async () => {
      await chat.createThreadReply('Reply 1', adminUser.id, parentMessage.id);
      await chat.createThreadReply('Reply 2', regularUser.id, parentMessage.id);

      const replies = await chat.getThreadReplies(parentMessage.id);
      expect(replies.length).toBe(2);
      expect(replies[0].content).toBe('Reply 1');
      expect(replies[1].content).toBe('Reply 2');
    });

    it('should return empty array for message with no replies', async () => {
      const replies = await chat.getThreadReplies(parentMessage.id);
      expect(replies).toEqual([]);
    });

    it('should not include thread replies in channel messages', async () => {
      await chat.createThreadReply(
        'Thread reply',
        adminUser.id,
        parentMessage.id
      );
      await chat.createMessage('Channel message', adminUser.id, testChannelId);

      const channelMessages = await chat.getMessagesByChannel(testChannelId);
      const threadReplies = channelMessages.filter((m) => m.threadId);
      expect(threadReplies.length).toBe(0);

      // But channel messages (including parent) should still be there
      expect(
        channelMessages.find((m) => m.id === parentMessage.id)
      ).toBeDefined();
    });
  });

  describe('Thread Reply Updates', () => {
    it('should update a thread reply', async () => {
      const { reply } = await chat.createThreadReply(
        'Original',
        adminUser.id,
        parentMessage.id
      );
      events.length = 0;

      const { message: updated } = await chat.updateThreadReply(
        reply.id,
        adminUser.id,
        'Updated'
      );
      expect(updated.content).toBe('Updated');
    });

    it('should throw error when message is not a thread reply', async () => {
      await expect(
        chat.updateThreadReply(parentMessage.id, adminUser.id, 'Updated')
      ).rejects.toThrow('Message is not a thread reply');
    });

    it('should throw error for non-existent message', async () => {
      await expect(
        chat.updateThreadReply('nonexistent', adminUser.id, 'Updated')
      ).rejects.toThrow('Message not found');
    });

    it('should not allow updating another users reply', async () => {
      const { reply } = await chat.createThreadReply(
        'My reply',
        adminUser.id,
        parentMessage.id
      );

      await expect(
        chat.updateThreadReply(reply.id, regularUser.id, 'Hacked')
      ).rejects.toThrow('You can only edit your own messages');
    });

    it('should emit UPDATE_THREAD_REPLY event', async () => {
      const { reply } = await chat.createThreadReply(
        'Original',
        adminUser.id,
        parentMessage.id
      );
      events.length = 0;

      await chat.updateThreadReply(reply.id, adminUser.id, 'Updated');

      const updateEvent = events.find((e) => e.type === 'UPDATE_THREAD_REPLY');
      expect(updateEvent).toBeDefined();
    });

    it('should return removed images when updating', async () => {
      const { reply } = await chat.createThreadReply(
        'With images',
        adminUser.id,
        parentMessage.id,
        ['img1.jpg', 'img2.jpg']
      );

      const { removedImages } = await chat.updateThreadReply(
        reply.id,
        adminUser.id,
        undefined,
        ['img1.jpg']
      );

      expect(removedImages).toContain('img2.jpg');
    });
  });

  describe('Thread Reply Deletion', () => {
    it('should delete own thread reply', async () => {
      const { reply } = await chat.createThreadReply(
        'To delete',
        adminUser.id,
        parentMessage.id
      );
      await chat.deleteThreadReply(reply.id, adminUser.id);

      const deleted = await chat.getMessageById(reply.id);
      expect(deleted).toBeNull();
    });

    it('should allow admin to delete any thread reply', async () => {
      const { reply } = await chat.createThreadReply(
        'User reply',
        regularUser.id,
        parentMessage.id
      );
      await chat.deleteThreadReply(reply.id, adminUser.id);

      const deleted = await chat.getMessageById(reply.id);
      expect(deleted).toBeNull();
    });

    it('should throw error when message is not a thread reply', async () => {
      await expect(
        chat.deleteThreadReply(parentMessage.id, adminUser.id)
      ).rejects.toThrow('Message is not a thread reply');
    });

    it('should throw error for non-existent message', async () => {
      await expect(
        chat.deleteThreadReply('nonexistent', adminUser.id)
      ).rejects.toThrow('Message not found');
    });

    it('should throw error for non-existent user', async () => {
      const { reply } = await chat.createThreadReply(
        'Reply',
        adminUser.id,
        parentMessage.id
      );

      await expect(
        chat.deleteThreadReply(reply.id, 'nonexistent')
      ).rejects.toThrow('User not found');
    });

    it('should not allow non-admin to delete another users reply', async () => {
      const { reply } = await chat.createThreadReply(
        'Admin reply',
        adminUser.id,
        parentMessage.id
      );

      await expect(
        chat.deleteThreadReply(reply.id, regularUser.id)
      ).rejects.toThrow('You can only delete your own messages');
    });

    it('should update parent threadMeta after deletion', async () => {
      const { reply: reply1 } = await chat.createThreadReply(
        'Reply 1',
        adminUser.id,
        parentMessage.id
      );
      await chat.createThreadReply('Reply 2', regularUser.id, parentMessage.id);

      await chat.deleteThreadReply(reply1.id, adminUser.id);

      const updated = await chat.getMessageById(parentMessage.id);
      expect(updated?.threadMeta?.replyCount).toBe(1);
    });

    it('should remove threadMeta when last reply is deleted', async () => {
      const { reply } = await chat.createThreadReply(
        'Only reply',
        adminUser.id,
        parentMessage.id
      );
      await chat.deleteThreadReply(reply.id, adminUser.id);

      const updated = await chat.getMessageById(parentMessage.id);
      expect(updated?.threadMeta).toBeUndefined();
    });

    it('should emit DELETE_THREAD_REPLY event', async () => {
      const { reply } = await chat.createThreadReply(
        'To delete',
        adminUser.id,
        parentMessage.id
      );
      events.length = 0;

      await chat.deleteThreadReply(reply.id, adminUser.id);

      const deleteEvent = events.find((e) => e.type === 'DELETE_THREAD_REPLY');
      expect(deleteEvent).toBeDefined();
      expect(deleteEvent?.payload).toMatchObject({
        id: reply.id,
        threadId: parentMessage.id
      });
    });
  });

  describe('Parent Message Deletion with Thread', () => {
    it('should delete all thread replies when parent is deleted', async () => {
      const { reply: reply1 } = await chat.createThreadReply(
        'Reply 1',
        adminUser.id,
        parentMessage.id
      );
      const { reply: reply2 } = await chat.createThreadReply(
        'Reply 2',
        regularUser.id,
        parentMessage.id
      );

      await chat.deleteMessage(parentMessage.id, adminUser.id);

      const r1 = await chat.getMessageById(reply1.id);
      const r2 = await chat.getMessageById(reply2.id);
      expect(r1).toBeNull();
      expect(r2).toBeNull();
    });
  });
});
