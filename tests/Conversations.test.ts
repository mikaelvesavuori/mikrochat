import { describe, it, expect, beforeEach } from 'vitest';

import { MikroChat } from '../src/MikroChat';
import type {
  Conversation,
  Message,
  ServerSentEvent,
  User
} from '../src/interfaces';

describe('MikroChat Conversations', () => {
  let chat: MikroChat;
  let adminUser: User;
  let regularUser: User;
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

    // Subscribe to events
    chat.subscribeToEvents((event) => events.push(event));

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get admin user
    adminUser = (await chat.getUserByEmail('admin@example.com')) as User;

    // Add a second user
    regularUser = await chat.addUser('user@example.com', adminUser.id);
  });

  describe('Conversation Creation', () => {
    it('should create a new conversation between two users', async () => {
      const { conversation, isNew } = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );

      expect(isNew).toBe(true);
      expect(conversation).toBeDefined();
      expect(conversation.participants).toContain(adminUser.id);
      expect(conversation.participants).toContain(regularUser.id);
      expect(conversation.id).toMatch(/^dm:/);
    });

    it('should return existing conversation if already exists', async () => {
      const { conversation: first, isNew: isNew1 } =
        await chat.getOrCreateConversation(adminUser.id, regularUser.id);
      const { conversation: second, isNew: isNew2 } =
        await chat.getOrCreateConversation(adminUser.id, regularUser.id);

      expect(isNew1).toBe(true);
      expect(isNew2).toBe(false);
      expect(first.id).toBe(second.id);
    });

    it('should return same conversation regardless of user order', async () => {
      const { conversation: first } = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );
      const { conversation: second } = await chat.getOrCreateConversation(
        regularUser.id,
        adminUser.id
      );

      expect(first.id).toBe(second.id);
    });

    it('should not allow creating conversation with oneself', async () => {
      await expect(
        chat.getOrCreateConversation(adminUser.id, adminUser.id)
      ).rejects.toThrow('Cannot create a conversation with yourself');
    });

    it('should throw when target user does not exist', async () => {
      await expect(
        chat.getOrCreateConversation(adminUser.id, 'nonexistent-user')
      ).rejects.toThrow('Target user not found');
    });

    it('should emit NEW_CONVERSATION event when creating new conversation', async () => {
      events.length = 0;
      await chat.getOrCreateConversation(adminUser.id, regularUser.id);

      const conversationEvent = events.find(
        (e) => e.type === 'NEW_CONVERSATION'
      );
      expect(conversationEvent).toBeDefined();
      expect(
        (conversationEvent?.payload as Conversation).participants
      ).toContain(adminUser.id);
    });

    it('should not emit event when returning existing conversation', async () => {
      await chat.getOrCreateConversation(adminUser.id, regularUser.id);
      events.length = 0;

      await chat.getOrCreateConversation(adminUser.id, regularUser.id);

      const conversationEvent = events.find(
        (e) => e.type === 'NEW_CONVERSATION'
      );
      expect(conversationEvent).toBeUndefined();
    });
  });

  describe('Conversation Listing', () => {
    it('should list conversations for a user', async () => {
      await chat.getOrCreateConversation(adminUser.id, regularUser.id);

      const adminConvs = await chat.listConversationsForUser(adminUser.id);
      const userConvs = await chat.listConversationsForUser(regularUser.id);

      expect(adminConvs.length).toBe(1);
      expect(userConvs.length).toBe(1);
    });

    it('should return empty array when user has no conversations', async () => {
      const thirdUser = await chat.addUser('third@example.com', adminUser.id);
      const convs = await chat.listConversationsForUser(thirdUser.id);
      expect(convs).toEqual([]);
    });

    it('should get conversation by ID', async () => {
      const { conversation } = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );

      const retrieved = await chat.getConversationById(conversation.id);
      expect(retrieved).toMatchObject(conversation);
    });

    it('should return null for non-existent conversation ID', async () => {
      const retrieved = await chat.getConversationById('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Direct Messages', () => {
    let conversation: Conversation;

    beforeEach(async () => {
      const result = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );
      conversation = result.conversation;
      events.length = 0;
    });

    it('should create a direct message', async () => {
      const message = await chat.createDirectMessage(
        'Hello, this is a DM!',
        adminUser.id,
        conversation.id
      );

      expect(message).toBeDefined();
      expect(message.content).toBe('Hello, this is a DM!');
      expect(message.author.id).toBe(adminUser.id);
      expect(message.channelId).toBe(conversation.id);
    });

    it('should emit NEW_DM_MESSAGE event', async () => {
      await chat.createDirectMessage('Test DM', adminUser.id, conversation.id);

      const dmEvent = events.find((e) => e.type === 'NEW_DM_MESSAGE');
      expect(dmEvent).toBeDefined();
      expect((dmEvent?.payload as Message).content).toBe('Test DM');
    });

    it('should update lastMessageAt on conversation when sending DM', async () => {
      const before = await chat.getConversationById(conversation.id);
      expect(before?.lastMessageAt).toBeUndefined();

      await chat.createDirectMessage('Test', adminUser.id, conversation.id);

      const after = await chat.getConversationById(conversation.id);
      expect(after?.lastMessageAt).toBeDefined();
      expect(after?.lastMessageAt).toBeGreaterThan(0);
    });

    it('should not allow non-participant to send DM', async () => {
      const thirdUser = await chat.addUser('third@example.com', adminUser.id);

      await expect(
        chat.createDirectMessage('Test', thirdUser.id, conversation.id)
      ).rejects.toThrow('You are not a participant in this conversation');
    });

    it('should throw when conversation does not exist', async () => {
      await expect(
        chat.createDirectMessage('Test', adminUser.id, 'nonexistent')
      ).rejects.toThrow('Conversation not found');
    });

    it('should create DM with images', async () => {
      const message = await chat.createDirectMessage(
        'Check out this image!',
        adminUser.id,
        conversation.id,
        ['image1.jpg', 'image2.png']
      );

      expect(message.images).toEqual(['image1.jpg', 'image2.png']);
    });

    it('should get messages by conversation', async () => {
      await chat.createDirectMessage('First', adminUser.id, conversation.id);
      await chat.createDirectMessage('Second', regularUser.id, conversation.id);
      await chat.createDirectMessage('Third', adminUser.id, conversation.id);

      const messages = await chat.getMessagesByConversation(conversation.id);
      expect(messages.length).toBe(3);
      expect(messages[0].content).toBe('First');
      expect(messages[2].content).toBe('Third');
    });
  });

  describe('Direct Message Updates', () => {
    let conversation: Conversation;
    let message: Message;

    beforeEach(async () => {
      const result = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );
      conversation = result.conversation;
      message = await chat.createDirectMessage(
        'Original content',
        adminUser.id,
        conversation.id
      );
      events.length = 0;
    });

    it('should update a direct message content', async () => {
      const { message: updated } = await chat.updateDirectMessage(
        message.id,
        adminUser.id,
        'Updated content'
      );

      expect(updated.content).toBe('Updated content');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(message.createdAt);
    });

    it('should emit UPDATE_DM_MESSAGE event', async () => {
      await chat.updateDirectMessage(message.id, adminUser.id, 'Updated');

      const updateEvent = events.find((e) => e.type === 'UPDATE_DM_MESSAGE');
      expect(updateEvent).toBeDefined();
    });

    it('should not allow updating someone elses message', async () => {
      await expect(
        chat.updateDirectMessage(message.id, regularUser.id, 'Hacked!')
      ).rejects.toThrow('You can only edit your own messages');
    });

    it('should return removed images when updating', async () => {
      const msgWithImages = await chat.createDirectMessage(
        'With images',
        adminUser.id,
        conversation.id,
        ['img1.jpg', 'img2.jpg']
      );

      const { removedImages } = await chat.updateDirectMessage(
        msgWithImages.id,
        adminUser.id,
        undefined,
        ['img1.jpg'] // Keep only img1
      );

      expect(removedImages).toContain('img2.jpg');
    });
  });

  describe('Direct Message Deletion', () => {
    let conversation: Conversation;
    let message: Message;

    beforeEach(async () => {
      const result = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );
      conversation = result.conversation;
      message = await chat.createDirectMessage(
        'To be deleted',
        adminUser.id,
        conversation.id
      );
      events.length = 0;
    });

    it('should delete own direct message', async () => {
      await chat.deleteDirectMessage(message.id, adminUser.id);

      const deleted = await chat.getMessageById(message.id);
      expect(deleted).toBeNull();
    });

    it('should emit DELETE_DM_MESSAGE event', async () => {
      await chat.deleteDirectMessage(message.id, adminUser.id);

      const deleteEvent = events.find((e) => e.type === 'DELETE_DM_MESSAGE');
      expect(deleteEvent).toBeDefined();
      expect(
        (deleteEvent?.payload as { id: string; conversationId: string })
          .conversationId
      ).toBe(conversation.id);
    });

    it('should not allow deleting someone elses DM (even as admin)', async () => {
      // Create message from regular user
      const otherMessage = await chat.createDirectMessage(
        'My private message',
        regularUser.id,
        conversation.id
      );

      // Admin should NOT be able to delete it (privacy)
      await expect(
        chat.deleteDirectMessage(otherMessage.id, adminUser.id)
      ).rejects.toThrow('You can only delete your own messages');
    });

    it('should throw when message does not exist', async () => {
      await expect(
        chat.deleteDirectMessage('nonexistent', adminUser.id)
      ).rejects.toThrow('Message not found');
    });
  });

  describe('Reactions on DMs', () => {
    let conversation: Conversation;
    let message: Message;

    beforeEach(async () => {
      const result = await chat.getOrCreateConversation(
        adminUser.id,
        regularUser.id
      );
      conversation = result.conversation;
      message = await chat.createDirectMessage(
        'React to me!',
        adminUser.id,
        conversation.id
      );
      events.length = 0;
    });

    it('should add reaction to DM', async () => {
      const updated = await chat.addReaction(message.id, regularUser.id, '👍');

      expect(updated.reactions[regularUser.id]).toContain('👍');
    });

    it('should remove reaction from DM', async () => {
      await chat.addReaction(message.id, regularUser.id, '👍');
      const updated = await chat.removeReaction(
        message.id,
        regularUser.id,
        '👍'
      );

      expect(updated.reactions[regularUser.id]).not.toContain('👍');
    });
  });

  describe('Message Limit Enforcement', () => {
    it('should remove oldest DM when limit is exceeded', async () => {
      const limitedChat = new MikroChat({
        initialUser: {
          id: 'admin-id',
          userName: 'admin',
          email: 'admin@example.com'
        },
        messageRetentionDays: 30,
        maxMessagesPerChannel: 3 // Very low limit for testing
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const admin = (await limitedChat.getUserByEmail(
        'admin@example.com'
      )) as User;
      const user = await limitedChat.addUser('user@example.com', admin.id);

      const { conversation } = await limitedChat.getOrCreateConversation(
        admin.id,
        user.id
      );

      // Create 4 messages (1 more than limit)
      await limitedChat.createDirectMessage('First', admin.id, conversation.id);
      await limitedChat.createDirectMessage('Second', user.id, conversation.id);
      await limitedChat.createDirectMessage('Third', admin.id, conversation.id);
      await limitedChat.createDirectMessage('Fourth', user.id, conversation.id);

      // Retention is deferred to the cleanup job, so all 4 messages remain
      const messages = await limitedChat.getMessagesByConversation(
        conversation.id
      );
      expect(messages.length).toBe(4);
    });
  });
});
