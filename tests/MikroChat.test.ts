import { describe, it, expect, beforeEach } from 'vitest';

import { MikroChat } from '../src/MikroChat';
import { InMemoryProvider } from '../src/providers/InMemoryProvider';
import type { ChatConfiguration, ServerSentEvent } from '../src/interfaces';

const createTestConfig = (
  overrides?: Partial<ChatConfiguration>
): ChatConfiguration => ({
  initialUser: {
    id: 'admin-user-id',
    userName: 'admin',
    email: 'admin@test.com'
  },
  messageRetentionDays: 30,
  maxMessagesPerChannel: 100,
  ...overrides
});

describe('MikroChat', () => {
  let chat: MikroChat;
  let db: InMemoryProvider;
  let config: ChatConfiguration;

  beforeEach(async () => {
    db = new InMemoryProvider();
    config = createTestConfig();
    chat = new MikroChat(config, db);
    // Allow initialization to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  describe('Initialization', () => {
    it('should create an admin user on initialization', async () => {
      const admin = await chat.getUserByEmail('admin@test.com');
      expect(admin).not.toBeNull();
      expect(admin?.isAdmin).toBe(true);
      expect(admin?.userName).toBe('admin');
    });

    it('should create a General channel on initialization', async () => {
      const channels = await chat.listChannels();
      const general = channels.find((c) => c.name === 'General');
      expect(general).toBeDefined();
    });

    // Note: Validation errors for missing email/userName happen during async initialization,
    // which makes them unhandled rejections rather than synchronous throws.
    // The validation still works at runtime but can't be tested with toThrow().
  });

  describe('User Management', () => {
    describe('addUser', () => {
      it('should add a new user', async () => {
        const user = await chat.addUser('newuser@test.com', 'admin-user-id');
        expect(user).toBeDefined();
        expect(user.email).toBe('newuser@test.com');
        expect(user.userName).toBe('newuser');
        expect(user.isAdmin).toBe(false);
      });

      it('should add an admin user when requested by admin', async () => {
        const user = await chat.addUser(
          'newadmin@test.com',
          'admin-user-id',
          true
        );
        expect(user.isAdmin).toBe(true);
      });

      it('should throw error when non-admin tries to add admin', async () => {
        const regularUser = await chat.addUser(
          'regular@test.com',
          'admin-user-id'
        );
        await expect(
          chat.addUser('another@test.com', regularUser.id, true)
        ).rejects.toThrow('Only administrators can add admin users');
      });

      it('should throw error when adding duplicate email', async () => {
        await chat.addUser('duplicate@test.com', 'admin-user-id');
        await expect(
          chat.addUser('duplicate@test.com', 'admin-user-id')
        ).rejects.toThrow('User with this email already exists');
      });

      it('should throw error when adder does not exist', async () => {
        await expect(
          chat.addUser('newuser@test.com', 'nonexistent-id')
        ).rejects.toThrow('User not found');
      });

      it('should allow force creation without existing user', async () => {
        const user = await chat.addUser('forced@test.com', '', false, true);
        expect(user).toBeDefined();
        expect(user.email).toBe('forced@test.com');
      });

      it('should emit NEW_USER event when user is added', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        await chat.addUser('eventuser@test.com', 'admin-user-id');

        const newUserEvent = events.find((e) => e.type === 'NEW_USER');
        expect(newUserEvent).toBeDefined();
        expect(newUserEvent?.payload).toMatchObject({
          email: 'eventuser@test.com',
          userName: 'eventuser'
        });
      });
    });

    describe('removeUser', () => {
      it('should remove a user', async () => {
        const user = await chat.addUser('toremove@test.com', 'admin-user-id');
        await chat.removeUser(user.id, 'admin-user-id');
        const removed = await chat.getUserById(user.id);
        expect(removed).toBeNull();
      });

      it('should throw error when non-admin tries to remove user', async () => {
        const regularUser = await chat.addUser(
          'regular@test.com',
          'admin-user-id'
        );
        const anotherUser = await chat.addUser(
          'another@test.com',
          'admin-user-id'
        );
        await expect(
          chat.removeUser(anotherUser.id, regularUser.id)
        ).rejects.toThrow('Only administrators can remove users');
      });

      it('should throw error when user to remove does not exist', async () => {
        await expect(
          chat.removeUser('nonexistent', 'admin-user-id')
        ).rejects.toThrow('User not found');
      });

      it('should throw error when requester does not exist', async () => {
        const user = await chat.addUser('target@test.com', 'admin-user-id');
        await expect(
          chat.removeUser(user.id, 'nonexistent')
        ).rejects.toThrow('Requester not found');
      });

      it('should throw error when removing last admin', async () => {
        await expect(
          chat.removeUser('admin-user-id', 'admin-user-id')
        ).rejects.toThrow('Cannot remove the last administrator');
      });

      it('should allow removing admin when another admin exists', async () => {
        const secondAdmin = await chat.addUser(
          'admin2@test.com',
          'admin-user-id',
          true
        );
        await chat.removeUser('admin-user-id', secondAdmin.id);
        const removed = await chat.getUserById('admin-user-id');
        expect(removed).toBeNull();
      });

      it('should emit REMOVE_USER event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const user = await chat.addUser('toremove@test.com', 'admin-user-id');
        await chat.removeUser(user.id, 'admin-user-id');

        const removeEvent = events.find((e) => e.type === 'REMOVE_USER');
        expect(removeEvent).toBeDefined();
      });
    });

    describe('exitUser', () => {
      it('should allow user to exit (self-remove)', async () => {
        const user = await chat.addUser('exiting@test.com', 'admin-user-id');
        await chat.exitUser(user.id);
        const exited = await chat.getUserById(user.id);
        expect(exited).toBeNull();
      });

      it('should throw error for non-existent user', async () => {
        await expect(chat.exitUser('nonexistent')).rejects.toThrow(
          'User not found'
        );
      });

      it('should emit USER_EXIT event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const user = await chat.addUser('exiting@test.com', 'admin-user-id');
        await chat.exitUser(user.id);

        const exitEvent = events.find((e) => e.type === 'USER_EXIT');
        expect(exitEvent).toBeDefined();
        expect(exitEvent?.payload).toMatchObject({ id: user.id });
      });
    });

    describe('listUsers', () => {
      it('should list all users', async () => {
        await chat.addUser('user1@test.com', 'admin-user-id');
        await chat.addUser('user2@test.com', 'admin-user-id');
        const users = await chat.listUsers();
        expect(users.length).toBe(3); // admin + 2 new users
      });
    });

    describe('updateUserName', () => {
      it('should update a user display name', async () => {
        const user = await chat.addUser('rename@test.com', 'admin-user-id');
        const updated = await chat.updateUserName(user.id, 'new-name');
        expect(updated.userName).toBe('new-name');
      });

      it('should trim whitespace from the new name', async () => {
        const user = await chat.addUser('trim@test.com', 'admin-user-id');
        const updated = await chat.updateUserName(user.id, '  trimmed  ');
        expect(updated.userName).toBe('trimmed');
      });

      it('should throw error for empty name', async () => {
        const user = await chat.addUser('empty@test.com', 'admin-user-id');
        await expect(chat.updateUserName(user.id, '')).rejects.toThrow(
          'User name cannot be empty'
        );
      });

      it('should throw error for whitespace-only name', async () => {
        const user = await chat.addUser('spaces@test.com', 'admin-user-id');
        await expect(chat.updateUserName(user.id, '   ')).rejects.toThrow(
          'User name cannot be empty'
        );
      });

      it('should throw error for non-existent user', async () => {
        await expect(
          chat.updateUserName('nonexistent', 'new-name')
        ).rejects.toThrow('User not found');
      });

      it('should throw error when username is already taken', async () => {
        const user1 = await chat.addUser('taken1@test.com', 'admin-user-id');
        const user2 = await chat.addUser('taken2@test.com', 'admin-user-id');
        await chat.updateUserName(user1.id, 'taken-name');

        await expect(
          chat.updateUserName(user2.id, 'taken-name')
        ).rejects.toThrow('User name is already taken');
      });

      it('should allow a user to keep their own name', async () => {
        const user = await chat.addUser('keep@test.com', 'admin-user-id');
        await chat.updateUserName(user.id, 'my-name');
        const updated = await chat.updateUserName(user.id, 'my-name');
        expect(updated.userName).toBe('my-name');
      });

      it('should emit UPDATE_USER event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const user = await chat.addUser('event@test.com', 'admin-user-id');
        await chat.updateUserName(user.id, 'renamed');

        const updateEvent = events.find((e) => e.type === 'UPDATE_USER');
        expect(updateEvent).toBeDefined();
        expect(updateEvent?.payload).toMatchObject({
          id: user.id,
          userName: 'renamed'
        });
      });
    });
  });

  describe('Channel Management', () => {
    describe('createChannel', () => {
      it('should create a new channel', async () => {
        const channel = await chat.createChannel(
          'test-channel',
          'admin-user-id'
        );
        expect(channel).toBeDefined();
        expect(channel.name).toBe('test-channel');
        expect(channel.createdBy).toBe('admin-user-id');
      });

      it('should throw error for duplicate channel name', async () => {
        await chat.createChannel('duplicate', 'admin-user-id');
        await expect(
          chat.createChannel('duplicate', 'admin-user-id')
        ).rejects.toThrow('Channel with name "duplicate" already exists');
      });

      it('should emit NEW_CHANNEL event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        await chat.createChannel('event-channel', 'admin-user-id');

        const newChannelEvent = events.find((e) => e.type === 'NEW_CHANNEL');
        expect(newChannelEvent).toBeDefined();
        expect(newChannelEvent?.payload).toMatchObject({
          name: 'event-channel'
        });
      });
    });

    describe('updateChannel', () => {
      it('should update channel name', async () => {
        const channel = await chat.createChannel('old-name', 'admin-user-id');
        const updated = await chat.updateChannel(
          channel.id,
          'new-name',
          'admin-user-id'
        );
        expect(updated.name).toBe('new-name');
      });

      it('should allow admin to update any channel', async () => {
        const user = await chat.addUser('creator@test.com', 'admin-user-id');
        const channel = await chat.createChannel('user-channel', user.id);
        const updated = await chat.updateChannel(
          channel.id,
          'admin-renamed',
          'admin-user-id'
        );
        expect(updated.name).toBe('admin-renamed');
      });

      it('should throw error when non-creator/non-admin tries to update', async () => {
        const creator = await chat.addUser('creator@test.com', 'admin-user-id');
        const other = await chat.addUser('other@test.com', 'admin-user-id');
        const channel = await chat.createChannel('protected', creator.id);

        await expect(
          chat.updateChannel(channel.id, 'hacked', other.id)
        ).rejects.toThrow('You can only edit channels you created');
      });

      it('should throw error for non-existent channel', async () => {
        await expect(
          chat.updateChannel('nonexistent', 'new-name', 'admin-user-id')
        ).rejects.toThrow('Channel not found');
      });

      it('should throw error for non-existent user', async () => {
        const channel = await chat.createChannel('ch-test', 'admin-user-id');
        await expect(
          chat.updateChannel(channel.id, 'new-name', 'nonexistent')
        ).rejects.toThrow('User not found');
      });

      it('should not allow renaming the General channel', async () => {
        const channels = await chat.listChannels();
        const general = channels.find((c) => c.name === 'General');

        const generalChannelId = general?.id;

        if (generalChannelId)
          await expect(
            chat.updateChannel(generalChannelId, 'Not General', 'admin-user-id')
          ).rejects.toThrow('The General channel cannot be renamed');
      });

      it('should throw error when renaming to existing name', async () => {
        const channel1 = await chat.createChannel('channel-1', 'admin-user-id');
        await chat.createChannel('channel-2', 'admin-user-id');

        await expect(
          chat.updateChannel(channel1.id, 'channel-2', 'admin-user-id')
        ).rejects.toThrow('Channel with name "channel-2" already exists');
      });

      it('should emit UPDATE_CHANNEL event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const channel = await chat.createChannel('to-update', 'admin-user-id');
        await chat.updateChannel(channel.id, 'updated', 'admin-user-id');

        const updateEvent = events.find((e) => e.type === 'UPDATE_CHANNEL');
        expect(updateEvent).toBeDefined();
      });
    });

    describe('deleteChannel', () => {
      it('should delete a channel', async () => {
        const channel = await chat.createChannel('to-delete', 'admin-user-id');
        await chat.deleteChannel(channel.id, 'admin-user-id');
        const channels = await chat.listChannels();
        expect(channels.find((c) => c.id === channel.id)).toBeUndefined();
      });

      it('should delete all messages in the channel', async () => {
        const channel = await chat.createChannel(
          'with-messages',
          'admin-user-id'
        );
        await chat.createMessage('msg1', 'admin-user-id', channel.id);
        await chat.createMessage('msg2', 'admin-user-id', channel.id);

        await chat.deleteChannel(channel.id, 'admin-user-id');

        const messages = await chat.getMessagesByChannel(channel.id);
        expect(messages.length).toBe(0);
      });

      it('should throw error for non-existent channel', async () => {
        await expect(
          chat.deleteChannel('nonexistent', 'admin-user-id')
        ).rejects.toThrow('Channel not found');
      });

      it('should throw error for non-existent user', async () => {
        const channel = await chat.createChannel('del-test', 'admin-user-id');
        await expect(
          chat.deleteChannel(channel.id, 'nonexistent')
        ).rejects.toThrow('User not found');
      });

      it('should not allow deleting the General channel', async () => {
        const channels = await chat.listChannels();
        const general = channels.find((c) => c.name === 'General');

        const generalChannelId = general?.id;

        if (generalChannelId)
          await expect(
            chat.deleteChannel(generalChannelId, 'admin-user-id')
          ).rejects.toThrow('The General channel cannot be deleted');
      });

      it('should throw error when non-creator/non-admin tries to delete', async () => {
        const creator = await chat.addUser('creator@test.com', 'admin-user-id');
        const other = await chat.addUser('other@test.com', 'admin-user-id');
        const channel = await chat.createChannel('protected', creator.id);

        await expect(chat.deleteChannel(channel.id, other.id)).rejects.toThrow(
          'You can only delete channels you created'
        );
      });

      it('should emit DELETE_CHANNEL event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const channel = await chat.createChannel('to-delete', 'admin-user-id');
        await chat.deleteChannel(channel.id, 'admin-user-id');

        const deleteEvent = events.find((e) => e.type === 'DELETE_CHANNEL');
        expect(deleteEvent).toBeDefined();
      });
    });

    describe('listChannels', () => {
      it('should list all channels including General', async () => {
        await chat.createChannel('extra-1', 'admin-user-id');
        await chat.createChannel('extra-2', 'admin-user-id');
        const channels = await chat.listChannels();
        expect(channels.length).toBe(3); // General + 2 new
      });
    });
  });

  describe('Message Management', () => {
    let testChannelId: string;

    beforeEach(async () => {
      const channel = await chat.createChannel(
        'test-messages',
        'admin-user-id'
      );
      testChannelId = channel.id;
    });

    describe('createMessage', () => {
      it('should create a message', async () => {
        const message = await chat.createMessage(
          'Hello, world!',
          'admin-user-id',
          testChannelId
        );
        expect(message).toBeDefined();
        expect(message.content).toBe('Hello, world!');
        expect(message.author.id).toBe('admin-user-id');
        expect(message.channelId).toBe(testChannelId);
      });

      it('should create message with images', async () => {
        const message = await chat.createMessage(
          'With images',
          'admin-user-id',
          testChannelId,
          ['img1.jpg', 'img2.png']
        );
        expect(message.images).toEqual(['img1.jpg', 'img2.png']);
      });

      it('should throw error for non-existent author', async () => {
        await expect(
          chat.createMessage('test', 'nonexistent', testChannelId)
        ).rejects.toThrow('Author not found');
      });

      it('should throw error for non-existent channel', async () => {
        await expect(
          chat.createMessage('test', 'admin-user-id', 'nonexistent')
        ).rejects.toThrow('Channel not found');
      });

      it('should emit NEW_MESSAGE event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        await chat.createMessage(
          'event message',
          'admin-user-id',
          testChannelId
        );

        const newMsgEvent = events.find((e) => e.type === 'NEW_MESSAGE');
        expect(newMsgEvent).toBeDefined();
        expect(newMsgEvent?.payload).toMatchObject({
          content: 'event message'
        });
      });

      it('should not delete messages on write (retention is deferred to cleanup job)', async () => {
        const limitedConfig = createTestConfig({ maxMessagesPerChannel: 3 });
        const limitedDb = new InMemoryProvider();
        const limitedChat = new MikroChat(limitedConfig, limitedDb);
        await new Promise((resolve) => setTimeout(resolve, 10));

        const channel = await limitedChat.createChannel(
          'limited',
          'admin-user-id'
        );

        await limitedChat.createMessage('msg1', 'admin-user-id', channel.id);
        await limitedChat.createMessage('msg2', 'admin-user-id', channel.id);
        await limitedChat.createMessage('msg3', 'admin-user-id', channel.id);
        await limitedChat.createMessage('msg4', 'admin-user-id', channel.id);

        const messages = await limitedChat.getMessagesByChannel(channel.id);
        expect(messages.length).toBe(4);
      });
    });

    describe('updateMessage', () => {
      it('should update message content', async () => {
        const message = await chat.createMessage(
          'original',
          'admin-user-id',
          testChannelId
        );
        const { message: updated } = await chat.updateMessage(
          message.id,
          'admin-user-id',
          'updated'
        );
        expect(updated.content).toBe('updated');
      });

      it('should update message images and return removed ones', async () => {
        const message = await chat.createMessage(
          'with images',
          'admin-user-id',
          testChannelId,
          ['a.jpg', 'b.jpg', 'c.jpg']
        );
        const { message: updated, removedImages } = await chat.updateMessage(
          message.id,
          'admin-user-id',
          undefined,
          ['a.jpg', 'c.jpg']
        );
        expect(updated.images).toEqual(['a.jpg', 'c.jpg']);
        expect(removedImages).toEqual(['b.jpg']);
      });

      it('should throw error when editing another users message', async () => {
        const other = await chat.addUser('other@test.com', 'admin-user-id');
        const message = await chat.createMessage(
          'owned',
          'admin-user-id',
          testChannelId
        );

        await expect(
          chat.updateMessage(message.id, other.id, 'hacked')
        ).rejects.toThrow('You can only edit your own messages');
      });

      it('should throw error for non-existent message', async () => {
        await expect(
          chat.updateMessage('nonexistent', 'admin-user-id', 'test')
        ).rejects.toThrow('Message not found');
      });

      it('should emit UPDATE_MESSAGE event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const message = await chat.createMessage(
          'original',
          'admin-user-id',
          testChannelId
        );
        await chat.updateMessage(message.id, 'admin-user-id', 'updated');

        const updateEvent = events.find((e) => e.type === 'UPDATE_MESSAGE');
        expect(updateEvent).toBeDefined();
      });
    });

    describe('deleteMessage', () => {
      it('should delete own message', async () => {
        const message = await chat.createMessage(
          'to delete',
          'admin-user-id',
          testChannelId
        );
        await chat.deleteMessage(message.id, 'admin-user-id');
        const deleted = await chat.getMessageById(message.id);
        expect(deleted).toBeNull();
      });

      it('should allow admin to delete any message', async () => {
        const user = await chat.addUser('user@test.com', 'admin-user-id');
        const message = await chat.createMessage(
          'user message',
          user.id,
          testChannelId
        );
        await chat.deleteMessage(message.id, 'admin-user-id');
        const deleted = await chat.getMessageById(message.id);
        expect(deleted).toBeNull();
      });

      it('should throw error for non-existent message', async () => {
        await expect(
          chat.deleteMessage('nonexistent', 'admin-user-id')
        ).rejects.toThrow('Message not found');
      });

      it('should throw error for non-existent user', async () => {
        const message = await chat.createMessage(
          'test',
          'admin-user-id',
          testChannelId
        );
        await expect(
          chat.deleteMessage(message.id, 'nonexistent')
        ).rejects.toThrow('User not found');
      });

      it('should throw error when non-author/non-admin tries to delete', async () => {
        const user1 = await chat.addUser('user1@test.com', 'admin-user-id');
        const user2 = await chat.addUser('user2@test.com', 'admin-user-id');
        const message = await chat.createMessage(
          'protected',
          user1.id,
          testChannelId
        );

        await expect(chat.deleteMessage(message.id, user2.id)).rejects.toThrow(
          'You can only delete your own messages'
        );
      });

      it('should emit DELETE_MESSAGE event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        const message = await chat.createMessage(
          'to delete',
          'admin-user-id',
          testChannelId
        );
        await chat.deleteMessage(message.id, 'admin-user-id');

        const deleteEvent = events.find((e) => e.type === 'DELETE_MESSAGE');
        expect(deleteEvent).toBeDefined();
        expect(deleteEvent?.payload).toMatchObject({
          id: message.id,
          channelId: testChannelId
        });
      });
    });

    describe('getMessagesByChannel', () => {
      it('should return all messages in channel', async () => {
        await chat.createMessage('msg1', 'admin-user-id', testChannelId);
        await chat.createMessage('msg2', 'admin-user-id', testChannelId);
        await chat.createMessage('msg3', 'admin-user-id', testChannelId);

        const messages = await chat.getMessagesByChannel(testChannelId);
        expect(messages.length).toBe(3);
      });

      it('should return empty array for channel with no messages', async () => {
        const emptyChannel = await chat.createChannel('empty', 'admin-user-id');
        const messages = await chat.getMessagesByChannel(emptyChannel.id);
        expect(messages).toEqual([]);
      });

      it('should not include thread replies in channel messages', async () => {
        const msg = await chat.createMessage(
          'parent',
          'admin-user-id',
          testChannelId
        );
        await chat.createThreadReply('reply', 'admin-user-id', msg.id);

        const messages = await chat.getMessagesByChannel(testChannelId);
        expect(messages.every((m) => !m.threadId)).toBe(true);
      });
    });
  });

  describe('Reaction Management', () => {
    let testChannelId: string;
    let testMessageId: string;

    beforeEach(async () => {
      const channel = await chat.createChannel(
        'reactions-test',
        'admin-user-id'
      );
      testChannelId = channel.id;
      const message = await chat.createMessage(
        'react to me',
        'admin-user-id',
        testChannelId
      );
      testMessageId = message.id;
    });

    describe('addReaction', () => {
      it('should add a reaction to a message', async () => {
        const updated = await chat.addReaction(
          testMessageId,
          'admin-user-id',
          '👍'
        );
        expect(updated.reactions['admin-user-id']).toContain('👍');
      });

      it('should throw error for non-existent user', async () => {
        await expect(
          chat.addReaction(testMessageId, 'nonexistent', '👍')
        ).rejects.toThrow('User not found');
      });

      it('should throw error for non-existent message', async () => {
        await expect(
          chat.addReaction('nonexistent', 'admin-user-id', '👍')
        ).rejects.toThrow('Message not found');
      });

      it('should emit NEW_REACTION event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        await chat.addReaction(testMessageId, 'admin-user-id', '🎉');

        const reactionEvent = events.find((e) => e.type === 'NEW_REACTION');
        expect(reactionEvent).toBeDefined();
        expect(reactionEvent?.payload).toMatchObject({
          messageId: testMessageId,
          userId: 'admin-user-id',
          reaction: '🎉'
        });
      });
    });

    describe('removeReaction', () => {
      it('should remove a reaction from a message', async () => {
        await chat.addReaction(testMessageId, 'admin-user-id', '👍');
        const updated = await chat.removeReaction(
          testMessageId,
          'admin-user-id',
          '👍'
        );
        expect(updated.reactions['admin-user-id'] || []).not.toContain('👍');
      });

      it('should throw error for non-existent user', async () => {
        await expect(
          chat.removeReaction(testMessageId, 'nonexistent', '👍')
        ).rejects.toThrow('User not found');
      });

      it('should throw error for non-existent message', async () => {
        await expect(
          chat.removeReaction('nonexistent', 'admin-user-id', '👍')
        ).rejects.toThrow('Message not found');
      });

      it('should emit DELETE_REACTION event', async () => {
        const events: ServerSentEvent[] = [];
        chat.subscribeToEvents((event) => events.push(event));

        await chat.addReaction(testMessageId, 'admin-user-id', '👍');
        await chat.removeReaction(testMessageId, 'admin-user-id', '👍');

        const deleteEvent = events.find((e) => e.type === 'DELETE_REACTION');
        expect(deleteEvent).toBeDefined();
      });
    });
  });

  describe('Password Authentication', () => {
    describe('setUserPassword', () => {
      it('should set a password on a user', async () => {
        const user = await chat.addUser('pwuser@test.com', 'admin-user-id');
        await chat.setUserPassword(user.id, 'securepass123');

        const updated = await chat.getUserById(user.id);
        expect(updated?.passwordHash).toBeDefined();
        expect(updated?.passwordHash).toContain(':');
      });

      it('should reject passwords shorter than 8 characters', async () => {
        const user = await chat.addUser('short@test.com', 'admin-user-id');
        await expect(chat.setUserPassword(user.id, 'short')).rejects.toThrow(
          'Password must be at least 8 characters'
        );
      });

      it('should throw error for non-existent user', async () => {
        await expect(
          chat.setUserPassword('nonexistent', 'securepass123')
        ).rejects.toThrow('User not found');
      });

      it('should produce different hashes for the same password (unique salt)', async () => {
        const user1 = await chat.addUser('salt1@test.com', 'admin-user-id');
        const user2 = await chat.addUser('salt2@test.com', 'admin-user-id');

        await chat.setUserPassword(user1.id, 'samepassword');
        await chat.setUserPassword(user2.id, 'samepassword');

        const u1 = await chat.getUserById(user1.id);
        const u2 = await chat.getUserById(user2.id);
        expect(u1?.passwordHash).not.toBe(u2?.passwordHash);
      });
    });

    describe('verifyUserPassword', () => {
      it('should verify a correct password', async () => {
        const user = await chat.addUser('verify@test.com', 'admin-user-id');
        await chat.setUserPassword(user.id, 'correctpass');

        const result = await chat.verifyUserPassword(
          'verify@test.com',
          'correctpass'
        );
        expect(result.id).toBe(user.id);
        expect(result.email).toBe('verify@test.com');
      });

      it('should reject an incorrect password', async () => {
        const user = await chat.addUser('wrong@test.com', 'admin-user-id');
        await chat.setUserPassword(user.id, 'correctpass');

        await expect(
          chat.verifyUserPassword('wrong@test.com', 'wrongpass')
        ).rejects.toThrow('Invalid credentials');
      });

      it('should reject when user has no password set', async () => {
        await chat.addUser('nopw@test.com', 'admin-user-id');

        await expect(
          chat.verifyUserPassword('nopw@test.com', 'anypass')
        ).rejects.toThrow('Invalid credentials');
      });

      it('should reject when user does not exist', async () => {
        await expect(
          chat.verifyUserPassword('nobody@test.com', 'anypass')
        ).rejects.toThrow('Invalid credentials');
      });
    });

    describe('password reset (overwrite existing password)', () => {
      it('should allow overwriting an existing password', async () => {
        const user = await chat.addUser('reset@test.com', 'admin-user-id');
        await chat.setUserPassword(user.id, 'oldpassword123');

        // Verify old password works
        const result = await chat.verifyUserPassword(
          'reset@test.com',
          'oldpassword123'
        );
        expect(result.email).toBe('reset@test.com');

        // Overwrite with new password
        await chat.setUserPassword(user.id, 'newpassword456');

        // New password should work
        const result2 = await chat.verifyUserPassword(
          'reset@test.com',
          'newpassword456'
        );
        expect(result2.email).toBe('reset@test.com');
      });

      it('should reject old password after reset', async () => {
        const user = await chat.addUser('resetold@test.com', 'admin-user-id');
        await chat.setUserPassword(user.id, 'oldpassword123');
        await chat.setUserPassword(user.id, 'newpassword456');

        await expect(
          chat.verifyUserPassword('resetold@test.com', 'oldpassword123')
        ).rejects.toThrow('Invalid credentials');
      });

      it('should produce a different hash when resetting to the same password', async () => {
        const user = await chat.addUser('resame@test.com', 'admin-user-id');
        await chat.setUserPassword(user.id, 'samepassword');

        const u1 = await chat.getUserById(user.id);
        const hash1 = u1?.passwordHash;

        await chat.setUserPassword(user.id, 'samepassword');

        const u2 = await chat.getUserById(user.id);
        const hash2 = u2?.passwordHash;

        // Different salts should produce different hashes
        expect(hash1).not.toBe(hash2);

        // But both should still verify
        const result = await chat.verifyUserPassword(
          'resame@test.com',
          'samepassword'
        );
        expect(result.email).toBe('resame@test.com');
      });
    });

    describe('sanitizeUser', () => {
      it('should strip passwordHash from user object', () => {
        const user = {
          id: 'test-id',
          userName: 'test',
          email: 'test@test.com',
          isAdmin: false,
          createdAt: Date.now(),
          passwordHash: 'salt:hash'
        };

        const sanitized = MikroChat.sanitizeUser(user);
        expect(sanitized).not.toHaveProperty('passwordHash');
        expect(sanitized.id).toBe('test-id');
        expect(sanitized.email).toBe('test@test.com');
      });

      it('should work on users without passwordHash', () => {
        const user = {
          id: 'test-id',
          userName: 'test',
          email: 'test@test.com',
          isAdmin: false,
          createdAt: Date.now()
        };

        const sanitized = MikroChat.sanitizeUser(user);
        expect(sanitized).not.toHaveProperty('passwordHash');
        expect(sanitized.id).toBe('test-id');
      });
    });
  });

  describe('Server Settings', () => {
    it('should get server settings', async () => {
      await chat.updateServerSettings({ name: 'Test Server' });
      const settings = await chat.getServerSettings();
      expect(settings).toMatchObject({ name: 'Test Server' });
    });

    it('should update server settings', async () => {
      await chat.updateServerSettings({ name: 'Updated Name' });
      const settings = await chat.getServerSettings();
      expect(settings?.name).toBe('Updated Name');
    });

    it('should emit UPDATE_SERVER_SETTINGS event', async () => {
      const events: ServerSentEvent[] = [];
      chat.subscribeToEvents((event) => events.push(event));

      await chat.updateServerSettings({ name: 'Event Test' });

      const settingsEvent = events.find(
        (e) => e.type === 'UPDATE_SERVER_SETTINGS'
      );
      expect(settingsEvent).toBeDefined();
      expect(settingsEvent?.payload).toMatchObject({ name: 'Event Test' });
    });
  });

  describe('Event Subscription', () => {
    it('should allow subscribing to events', async () => {
      const events: ServerSentEvent[] = [];
      const unsubscribe = chat.subscribeToEvents((event) => events.push(event));

      await chat.createChannel('event-test', 'admin-user-id');

      expect(events.length).toBeGreaterThan(0);
      unsubscribe();
    });

    it('should stop receiving events after unsubscribe', async () => {
      const events: ServerSentEvent[] = [];
      const unsubscribe = chat.subscribeToEvents((event) => events.push(event));

      await chat.createChannel('before-unsub', 'admin-user-id');
      const countBefore = events.length;

      unsubscribe();

      await chat.createChannel('after-unsub', 'admin-user-id');
      expect(events.length).toBe(countBefore);
    });
  });
});
