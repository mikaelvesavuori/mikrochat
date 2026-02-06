import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryProvider } from '../src/providers/InMemoryProvider';
import { GeneralStorageProvider } from '../src/providers/GeneralStorageProvider';
import type { User, Channel, Message, Conversation } from '../src/interfaces';

describe('InMemoryProvider', () => {
  let provider: InMemoryProvider;

  beforeEach(() => {
    provider = new InMemoryProvider();
  });

  describe('User Operations', () => {
    const testUser: User = {
      id: 'user-1',
      userName: 'testuser',
      email: 'test@example.com',
      isAdmin: false,
      createdAt: Date.now()
    };

    it('should create and retrieve a user by ID', async () => {
      await provider.createUser(testUser);
      const retrieved = await provider.getUserById('user-1');
      expect(retrieved).toMatchObject(testUser);
    });

    it('should retrieve a user by email', async () => {
      await provider.createUser(testUser);
      const retrieved = await provider.getUserByEmail('test@example.com');
      expect(retrieved).toMatchObject(testUser);
    });

    it('should retrieve a user by username', async () => {
      await provider.createUser(testUser);
      const retrieved = await provider.getUserByUsername('testuser');
      expect(retrieved).toMatchObject(testUser);
    });

    it('should return null for non-existent user', async () => {
      const user = await provider.getUserById('nonexistent');
      expect(user).toBeNull();
    });

    it('should list all users', async () => {
      const user2: User = {
        ...testUser,
        id: 'user-2',
        email: 'test2@example.com',
        userName: 'testuser2'
      };
      await provider.createUser(testUser);
      await provider.createUser(user2);
      const users = await provider.listUsers();
      expect(users.length).toBe(2);
    });

    it('should delete a user', async () => {
      await provider.createUser(testUser);
      await provider.deleteUser('user-1');
      const deleted = await provider.getUserById('user-1');
      expect(deleted).toBeNull();
    });
  });

  describe('Channel Operations', () => {
    const testChannel: Channel = {
      id: 'channel-1',
      name: 'test-channel',
      createdAt: Date.now(),
      createdBy: 'user-1'
    };

    it('should create and retrieve a channel by ID', async () => {
      await provider.createChannel(testChannel);
      const retrieved = await provider.getChannelById('channel-1');
      expect(retrieved).toMatchObject(testChannel);
    });

    it('should retrieve a channel by name', async () => {
      await provider.createChannel(testChannel);
      const retrieved = await provider.getChannelByName('test-channel');
      expect(retrieved).toMatchObject(testChannel);
    });

    it('should return null for non-existent channel', async () => {
      const channel = await provider.getChannelById('nonexistent');
      expect(channel).toBeNull();
    });

    it('should list all channels', async () => {
      const channel2: Channel = {
        ...testChannel,
        id: 'channel-2',
        name: 'test-channel-2'
      };
      await provider.createChannel(testChannel);
      await provider.createChannel(channel2);
      const channels = await provider.listChannels();
      expect(channels.length).toBe(2);
    });

    it('should update a channel', async () => {
      await provider.createChannel(testChannel);
      const updated = {
        ...testChannel,
        name: 'updated-name',
        updatedAt: Date.now()
      };
      await provider.updateChannel(updated);
      const retrieved = await provider.getChannelById('channel-1');
      expect(retrieved?.name).toBe('updated-name');
    });

    it('should delete a channel', async () => {
      await provider.createChannel(testChannel);
      await provider.deleteChannel('channel-1');
      const deleted = await provider.getChannelById('channel-1');
      expect(deleted).toBeNull();
    });
  });

  describe('Message Operations', () => {
    const testMessage: Message = {
      id: 'message-1',
      content: 'Hello, world!',
      author: { id: 'user-1', userName: 'testuser' },
      channelId: 'channel-1',
      createdAt: Date.now(),
      reactions: {}
    };

    it('should create and retrieve a message by ID', async () => {
      await provider.createMessage(testMessage);
      const retrieved = await provider.getMessageById('message-1');
      expect(retrieved).toMatchObject(testMessage);
    });

    it('should return null for non-existent message', async () => {
      const message = await provider.getMessageById('nonexistent');
      expect(message).toBeNull();
    });

    it('should list messages by channel', async () => {
      const message2: Message = {
        ...testMessage,
        id: 'message-2',
        content: 'Second message'
      };
      const messageOtherChannel: Message = {
        ...testMessage,
        id: 'message-3',
        channelId: 'channel-2'
      };

      await provider.createMessage(testMessage);
      await provider.createMessage(message2);
      await provider.createMessage(messageOtherChannel);

      const messagesInChannel1 =
        await provider.listMessagesByChannel('channel-1');
      expect(messagesInChannel1.length).toBe(2);

      const messagesInChannel2 =
        await provider.listMessagesByChannel('channel-2');
      expect(messagesInChannel2.length).toBe(1);
    });

    it('should sort messages by createdAt', async () => {
      const older: Message = { ...testMessage, id: 'older', createdAt: 1000 };
      const newer: Message = { ...testMessage, id: 'newer', createdAt: 2000 };

      await provider.createMessage(newer);
      await provider.createMessage(older);

      const messages = await provider.listMessagesByChannel('channel-1');
      expect(messages[0].id).toBe('older');
      expect(messages[1].id).toBe('newer');
    });

    it('should update a message', async () => {
      await provider.createMessage(testMessage);
      const updated = {
        ...testMessage,
        content: 'Updated content',
        updatedAt: Date.now()
      };
      await provider.updateMessage(updated);
      const retrieved = await provider.getMessageById('message-1');
      expect(retrieved?.content).toBe('Updated content');
    });

    it('should delete a message', async () => {
      await provider.createMessage(testMessage);
      await provider.deleteMessage('message-1');
      const deleted = await provider.getMessageById('message-1');
      expect(deleted).toBeNull();
    });
  });

  describe('Reaction Operations', () => {
    const testMessage: Message = {
      id: 'message-1',
      content: 'React to me',
      author: { id: 'user-1', userName: 'testuser' },
      channelId: 'channel-1',
      createdAt: Date.now(),
      reactions: {}
    };

    beforeEach(async () => {
      await provider.createMessage(testMessage);
    });

    it('should add a reaction to a message', async () => {
      const updated = await provider.addReaction('message-1', 'user-1', '👍');
      expect(updated?.reactions['user-1']).toContain('👍');
    });

    it('should add multiple users with same reaction', async () => {
      await provider.addReaction('message-1', 'user-1', '👍');
      const updated = await provider.addReaction('message-1', 'user-2', '👍');
      expect(updated?.reactions['user-1']).toContain('👍');
      expect(updated?.reactions['user-2']).toContain('👍');
    });

    it('should not duplicate same reaction by same user', async () => {
      await provider.addReaction('message-1', 'user-1', '👍');
      const updated = await provider.addReaction('message-1', 'user-1', '👍');
      const userReactions = updated?.reactions['user-1'] || [];
      const thumbsUpCount = userReactions.filter((r) => r === '👍').length;
      expect(thumbsUpCount).toBe(1);
    });

    it('should add different reactions by same user', async () => {
      await provider.addReaction('message-1', 'user-1', '👍');
      const updated = await provider.addReaction('message-1', 'user-1', '❤️');
      expect(updated?.reactions['user-1']).toContain('👍');
      expect(updated?.reactions['user-1']).toContain('❤️');
    });

    it('should remove a reaction from a message', async () => {
      await provider.addReaction('message-1', 'user-1', '👍');
      await provider.addReaction('message-1', 'user-1', '❤️');
      const updated = await provider.removeReaction(
        'message-1',
        'user-1',
        '👍'
      );
      expect(updated?.reactions['user-1']).not.toContain('👍');
      expect(updated?.reactions['user-1']).toContain('❤️');
    });

    it('should return null when adding reaction to non-existent message', async () => {
      const result = await provider.addReaction('nonexistent', 'user-1', '👍');
      expect(result).toBeNull();
    });

    it('should return null when removing reaction from non-existent message', async () => {
      const result = await provider.removeReaction(
        'nonexistent',
        'user-1',
        '👍'
      );
      expect(result).toBeNull();
    });
  });

  describe('Server Settings Operations', () => {
    it('should return null when no settings exist', async () => {
      const settings = await provider.getServerSettings();
      expect(settings).toBeNull();
    });

    it('should save and retrieve server settings', async () => {
      await provider.updateServerSettings({ name: 'My Server' });
      const settings = await provider.getServerSettings();
      expect(settings).toMatchObject({ name: 'My Server' });
    });

    it('should update existing server settings', async () => {
      await provider.updateServerSettings({ name: 'Original' });
      await provider.updateServerSettings({ name: 'Updated' });
      const settings = await provider.getServerSettings();
      expect(settings?.name).toBe('Updated');
    });
  });

  describe('Conversation Operations', () => {
    const testConversation: Conversation = {
      id: 'dm:user-1_user-2',
      participants: ['user-1', 'user-2'],
      createdAt: Date.now()
    };

    it('should generate deterministic conversation ID', () => {
      const id1 = GeneralStorageProvider.generateConversationId(
        'user-1',
        'user-2'
      );
      const id2 = GeneralStorageProvider.generateConversationId(
        'user-2',
        'user-1'
      );
      expect(id1).toBe(id2);
      expect(id1).toBe('dm:user-1_user-2');
    });

    it('should create and retrieve a conversation by ID', async () => {
      await provider.createConversation(testConversation);
      const retrieved = await provider.getConversationById('dm:user-1_user-2');
      expect(retrieved).toMatchObject(testConversation);
    });

    it('should retrieve a conversation by participants', async () => {
      await provider.createConversation(testConversation);
      const retrieved = await provider.getConversationByParticipants(
        'user-1',
        'user-2'
      );
      expect(retrieved).toMatchObject(testConversation);
    });

    it('should retrieve a conversation by participants (reversed order)', async () => {
      await provider.createConversation(testConversation);
      const retrieved = await provider.getConversationByParticipants(
        'user-2',
        'user-1'
      );
      expect(retrieved).toMatchObject(testConversation);
    });

    it('should return null for non-existent conversation', async () => {
      const conversation = await provider.getConversationById('nonexistent');
      expect(conversation).toBeNull();
    });

    it('should list conversations for a user', async () => {
      const conv2: Conversation = {
        id: 'dm:user-1_user-3',
        participants: ['user-1', 'user-3'],
        createdAt: Date.now()
      };
      const conv3: Conversation = {
        id: 'dm:user-2_user-3',
        participants: ['user-2', 'user-3'],
        createdAt: Date.now()
      };

      await provider.createConversation(testConversation);
      await provider.createConversation(conv2);
      await provider.createConversation(conv3);

      const user1Convs = await provider.listConversationsForUser('user-1');
      expect(user1Convs.length).toBe(2);

      const user3Convs = await provider.listConversationsForUser('user-3');
      expect(user3Convs.length).toBe(2);
    });

    it('should sort conversations by lastMessageAt', async () => {
      const older: Conversation = {
        id: 'dm:user-1_user-2',
        participants: ['user-1', 'user-2'],
        createdAt: 1000,
        lastMessageAt: 1000
      };
      const newer: Conversation = {
        id: 'dm:user-1_user-3',
        participants: ['user-1', 'user-3'],
        createdAt: 500,
        lastMessageAt: 2000
      };

      await provider.createConversation(older);
      await provider.createConversation(newer);

      const conversations = await provider.listConversationsForUser('user-1');
      expect(conversations[0].id).toBe('dm:user-1_user-3'); // Newer lastMessageAt first
      expect(conversations[1].id).toBe('dm:user-1_user-2');
    });

    it('should update a conversation', async () => {
      await provider.createConversation(testConversation);
      const updated = {
        ...testConversation,
        lastMessageAt: Date.now(),
        updatedAt: Date.now()
      };
      await provider.updateConversation(updated);
      const retrieved = await provider.getConversationById('dm:user-1_user-2');
      expect(retrieved?.lastMessageAt).toBe(updated.lastMessageAt);
    });

    it('should list messages by conversation', async () => {
      const dmMessage1: Message = {
        id: 'dm-msg-1',
        content: 'Hello in DM',
        author: { id: 'user-1', userName: 'testuser' },
        channelId: 'dm:user-1_user-2',
        createdAt: 1000,
        reactions: {}
      };
      const dmMessage2: Message = {
        id: 'dm-msg-2',
        content: 'Reply in DM',
        author: { id: 'user-2', userName: 'testuser2' },
        channelId: 'dm:user-1_user-2',
        createdAt: 2000,
        reactions: {}
      };
      const channelMessage: Message = {
        id: 'channel-msg-1',
        content: 'Hello in channel',
        author: { id: 'user-1', userName: 'testuser' },
        channelId: 'channel-1',
        createdAt: 1500,
        reactions: {}
      };

      await provider.createMessage(dmMessage1);
      await provider.createMessage(dmMessage2);
      await provider.createMessage(channelMessage);

      const dmMessages =
        await provider.listMessagesByConversation('dm:user-1_user-2');
      expect(dmMessages.length).toBe(2);
      expect(dmMessages[0].id).toBe('dm-msg-1');
      expect(dmMessages[1].id).toBe('dm-msg-2');
    });
  });
});
