import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { MikroID } from 'mikroid';

import type {
  Channel,
  ChatConfiguration,
  Conversation,
  Message,
  PaginationOptions,
  ServerSentEvent,
  ThreadMeta,
  User,
  Webhook
} from './interfaces';

import { GeneralStorageProvider } from './providers/GeneralStorageProvider';
import { InMemoryProvider } from './providers/InMemoryProvider';

import { idConfig, idName } from './config/configDefaults';

/**
 * @description MikroChat is a minimalistic, back-to-basics,
 * and complete chat application for those tired of expensive
 * bills, vendor lock-in, and distractions.
 */
export class MikroChat {
  private readonly config: ChatConfiguration;
  private readonly db: GeneralStorageProvider;
  private readonly id: MikroID;
  private readonly eventEmitter: EventEmitter;

  private readonly generalChannelName = 'General';

  constructor(config: ChatConfiguration, db?: GeneralStorageProvider) {
    this.config = config;
    this.db = db || new InMemoryProvider();
    this.id = new MikroID();
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(0); // Allow any number of event listeners

    this.initialize();
  }

  /**
   * @description Initialize the server with a general channel
   * and everything else needed to get started.
   */
  private async initialize(): Promise<void> {
    const id = this.config.initialUser.id;
    const userName = this.config.initialUser.userName;
    const email = this.config.initialUser.email;

    if (!userName || !email)
      throw new Error(
        'Missing required data to start a new MikroChat server. Required arguments are "initialUser.userName" and "initialUser.email".'
      );

    this.id.add(idConfig);

    const adminUser = await this.getUserByEmail(email);
    if (!adminUser) {
      await this.createUser({
        id: id || this.id.custom(idName),
        userName: userName || email.split('@')[0],
        email,
        isAdmin: true,
        createdAt: Date.now()
      });
    }

    const generalChannel = await this.db.getChannelByName(
      this.generalChannelName
    );
    if (!generalChannel) {
      await this.db.createChannel({
        id: this.id.custom(idName),
        name: this.generalChannelName,
        createdAt: Date.now(),
        createdBy: this.config.initialUser.id
      });
    }

    this.scheduleMessageCleanup();
  }

  /**
   * @description Run a job to clean up messages that are
   * out of date.
   */
  private scheduleMessageCleanup(): void {
    const runEveryNrMinutes = 60;
    const cleanupInterval = 1000 * 60 * runEveryNrMinutes;

    setInterval(async () => {
      const channels = await this.db.listChannels();

      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const cutoffTimestamp =
        Date.now() - this.config.messageRetentionDays * millisecondsPerDay;

      for (const channel of channels) {
        const index = await this.db.getIndex(`idx:channel-msgs:${channel.id}`);

        // Time-based retention: remove expired messages
        for (const msgId of index) {
          const message = await this.db.getMessageById(msgId);
          if (!message) continue;
          if (message.createdAt < cutoffTimestamp) {
            const threadReplies = await this.db.listMessagesByThread(
              message.id
            );
            for (const reply of threadReplies) {
              await this.db.deleteMessage(reply.id);
            }
            await this.db.deleteMessage(message.id);
            this.emitEvent({
              type: 'DELETE_MESSAGE',
              payload: { id: message.id, channelId: channel.id }
            });
          }
        }

        // Count-based retention: trim excess messages
        const currentIndex = await this.db.getIndex(
          `idx:channel-msgs:${channel.id}`
        );
        if (currentIndex.length > this.config.maxMessagesPerChannel) {
          const excess =
            currentIndex.length - this.config.maxMessagesPerChannel;
          const toRemove = currentIndex.slice(0, excess);
          for (const msgId of toRemove) {
            await this.db.deleteMessage(msgId);
            this.emitEvent({
              type: 'DELETE_MESSAGE',
              payload: { id: msgId, channelId: channel.id }
            });
          }
        }
      }
    }, cleanupInterval);
  }

  ////////////////////////////
  // Database proxy methods //
  ////////////////////////////

  public async getServerSettings() {
    return await this.db.getServerSettings();
  }

  public async updateServerSettings(settings: { name: string }) {
    return await this.db.updateServerSettings(settings);
  }

  public async getMessageById(id: string) {
    return await this.db.getMessageById(id);
  }

  public async listUsers() {
    return await this.db.listUsers();
  }

  public async getUserById(id: string) {
    return await this.db.getUserById(id);
  }

  public async getUserByEmail(email: string) {
    return await this.db.getUserByEmail(email);
  }

  public async createUser(user: User) {
    return await this.db.createUser(user);
  }

  public async deleteUser(id: string): Promise<void> {
    await this.db.deleteUser(id);
  }

  /////////////////////
  // User management //
  /////////////////////

  /**
   * @description Adds a new user to the server.
   *
   * The `force` option is used when creating users out-of-context
   * of the web application, such as directly on the server.
   */
  public async addUser(
    email: string,
    addedBy = '',
    isAdmin = false,
    force = false
  ): Promise<User> {
    const adminUser = await this.getUserById(addedBy);

    if (!force && !adminUser) throw new Error('User not found');

    if (isAdmin && !adminUser?.isAdmin)
      throw new Error('Only administrators can add admin users');

    const existingUser = await this.getUserByEmail(email);
    if (existingUser) throw new Error('User with this email already exists');

    const id = this.id.custom(idName);

    const user: User = {
      id,
      userName: email.split('@')[0],
      email,
      isAdmin,
      createdAt: Date.now(),
      addedBy: addedBy ? addedBy : id // Will be own ID when a user is created without prior invitation ("self-invite")
    };

    await this.createUser(user);

    this.emitEvent({
      type: 'NEW_USER',
      payload: { id: user.id, userName: user.userName, email: user.email }
    });

    return user;
  }

  /**
   * @description Removes a user from the server.
   */
  public async removeUser(userId: string, requestedBy: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const requester = await this.getUserById(requestedBy);
    if (!requester) throw new Error('Requester not found');

    if (!requester.isAdmin)
      throw new Error('Only administrators can remove users');

    if (user.isAdmin) {
      const admins = (await this.listUsers()).filter((u: User) => u.isAdmin);
      if (admins.length <= 1)
        throw new Error('Cannot remove the last administrator');
    }

    await this.deleteUser(userId);

    this.emitEvent({
      type: 'REMOVE_USER',
      payload: { id: userId, email: user.email }
    });
  }

  /**
   * @description Handles a user exiting the server (self-removal).
   */
  public async exitUser(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    await this.deleteUser(userId);

    this.emitEvent({
      type: 'USER_EXIT',
      payload: { id: userId, userName: user.userName }
    });
  }

  //////////////////////
  // Password methods //
  //////////////////////

  private static readonly MIN_PASSWORD_LENGTH = 8;

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
    return `${salt}:${hash.toString('hex')}`;
  }

  private async verifyPasswordHash(
    password: string,
    stored: string
  ): Promise<boolean> {
    const [salt, hash] = stored.split(':');
    const hashBuffer = Buffer.from(hash, 'hex');
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
    return timingSafeEqual(hashBuffer, derivedKey);
  }

  /**
   * @description Set or update a user's password.
   */
  public async setUserPassword(
    userId: string,
    password: string
  ): Promise<void> {
    if (password.length < MikroChat.MIN_PASSWORD_LENGTH)
      throw new Error(
        `Password must be at least ${MikroChat.MIN_PASSWORD_LENGTH} characters`
      );

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const passwordHash = await this.hashPassword(password);
    await this.db.createUser({ ...user, passwordHash });
  }

  /**
   * @description Verify a user's password and return the user on success.
   */
  public async verifyUserPassword(
    email: string,
    password: string
  ): Promise<User> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash) throw new Error('Invalid credentials');

    const valid = await this.verifyPasswordHash(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    return user;
  }

  /**
   * @description Strip sensitive fields from a user object before returning to clients.
   */
  public static sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  /////////////////////
  // Channel methods //
  /////////////////////

  /**
   * @description Create a new channel on the server.
   */
  public async createChannel(
    name: string,
    createdBy: string
  ): Promise<Channel> {
    const existingChannel = await this.db.getChannelByName(name);
    if (existingChannel)
      throw new Error(`Channel with name "${name}" already exists`);

    const channel: Channel = {
      id: this.id.custom(idName),
      name,
      createdAt: Date.now(),
      createdBy
    };

    await this.db.createChannel(channel);

    this.emitEvent({
      type: 'NEW_CHANNEL',
      payload: channel
    });

    return channel;
  }

  /**
   * @description Update a channel on the server.
   */
  public async updateChannel(
    id: string,
    name: string,
    userId: string
  ): Promise<Channel> {
    const channel = await this.db.getChannelById(id);
    if (!channel) throw new Error('Channel not found');

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (channel.createdBy !== userId && !user.isAdmin)
      throw new Error('You can only edit channels you created');

    if (channel.name === this.generalChannelName)
      throw new Error(
        `The ${this.generalChannelName} channel cannot be renamed`
      );

    // Check if another channel with the new name already exists
    const channelWithSameName = await this.db.getChannelByName(name);
    if (channelWithSameName && channelWithSameName.id !== id)
      throw new Error(`Channel with name "${name}" already exists`);

    channel.name = name;
    channel.updatedAt = Date.now();

    await this.db.updateChannel(channel);

    this.emitEvent({
      type: 'UPDATE_CHANNEL',
      payload: channel
    });

    return channel;
  }

  /**
   * @description Delete a channel on the server.
   */
  public async deleteChannel(id: string, userId: string): Promise<void> {
    const channel = await this.db.getChannelById(id);
    if (!channel) throw new Error('Channel not found');

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (channel.createdBy !== userId && !user.isAdmin)
      throw new Error('You can only delete channels you created');

    if (channel.name.toLowerCase() === this.generalChannelName.toLowerCase())
      throw new Error('The General channel cannot be deleted');

    const messages = await this.db.listMessagesByChannel(id);
    for (const message of messages) {
      await this.db.deleteMessage(message.id);
    }

    const webhooks = await this.db.listWebhooksByChannel(id);
    for (const webhook of webhooks) {
      await this.db.deleteWebhook(webhook.id);
    }

    await this.db.deleteChannel(id);

    this.emitEvent({
      type: 'DELETE_CHANNEL',
      payload: { id, name: channel.name }
    });
  }

  /**
   * @description List all channels on the server.
   */
  public async listChannels(): Promise<Channel[]> {
    return await this.db.listChannels();
  }

  /////////////////////
  // Message methods //
  /////////////////////

  /**
   * @description Create a new message.
   */
  public async createMessage(
    content: string,
    authorId: string,
    channelId: string,
    images: string[] = []
  ): Promise<Message> {
    const user = await this.getUserById(authorId);
    if (!user) throw new Error('Author not found');

    const channel = await this.db.getChannelById(channelId);
    if (!channel) throw new Error('Channel not found');

    const now = Date.now();

    const message: Message = {
      id: this.id.custom(idName),
      author: {
        id: authorId,
        userName: user.userName
      },
      images,
      content,
      channelId,
      createdAt: now,
      updatedAt: now,
      reactions: {}
    };

    await this.db.createMessage(message);

    this.emitEvent({
      type: 'NEW_MESSAGE',
      payload: message
    });

    return message;
  }

  /**
   * @description Update an existing message.
   */
  public async updateMessage(
    id: string,
    userId: string,
    content?: string,
    images?: string[]
  ): Promise<{ message: Message; removedImages: string[] }> {
    const message = await this.getMessageById(id);
    if (!message) throw new Error('Message not found');

    if (message.author.id !== userId)
      throw new Error('You can only edit your own messages');

    let removedImages: string[] = [];

    if (content) message.content = content;
    if (images) {
      const currentImages = message.images || [];
      removedImages = currentImages.filter((img) => !images.includes(img));
      message.images = images;
    }
    message.updatedAt = Date.now();

    await this.db.updateMessage(message);

    this.emitEvent({
      type: 'UPDATE_MESSAGE',
      payload: message
    });

    return { message, removedImages };
  }

  /**
   * @description Delete an existing message.
   */
  public async deleteMessage(id: string, userId: string): Promise<void> {
    const message = await this.getMessageById(id);
    if (!message) throw new Error('Message not found');

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    // Only allow deletion by the author or an admin
    if (message.author.id !== userId && !user.isAdmin)
      throw new Error('You can only delete your own messages');

    // Cascade-delete thread replies when parent is deleted
    if (message.threadMeta && message.threadMeta.replyCount > 0) {
      const threadReplies = await this.db.listMessagesByThread(id);
      for (const reply of threadReplies) {
        await this.db.deleteMessage(reply.id);
      }
    }

    await this.db.deleteMessage(id);

    this.emitEvent({
      type: 'DELETE_MESSAGE',
      payload: { id, channelId: message.channelId }
    });
  }

  /**
   * @description Get all message in a given channel.
   */
  public async getMessagesByChannel(
    channelId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    return await this.db.listMessagesByChannel(channelId, options);
  }

  //////////////////////
  // Reaction methods //
  //////////////////////

  /**
   * @description Add a reaction to a message.
   */
  public async addReaction(
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<Message> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const message = await this.getMessageById(messageId);
    if (!message) throw new Error('Message not found');

    const updatedMessage = await this.db.addReaction(
      messageId,
      userId,
      reaction
    );

    if (!updatedMessage) throw new Error('Failed to add reaction');

    this.emitEvent({
      type: 'NEW_REACTION',
      payload: { messageId, userId, reaction }
    });

    return updatedMessage;
  }

  /**
   * @description Remove a reaction from a message.
   */
  public async removeReaction(
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<Message> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const message = await this.getMessageById(messageId);
    if (!message) throw new Error('Message not found');

    const updatedMessage = await this.db.removeReaction(
      messageId,
      userId,
      reaction
    );
    if (!updatedMessage) throw new Error('Failed to remove reaction');

    this.emitEvent({
      type: 'DELETE_REACTION',
      payload: { messageId, userId, reaction }
    });

    return updatedMessage;
  }

  //////////////////////////
  // Conversation methods //
  //////////////////////////

  /**
   * @description Get or create a conversation between two users.
   */
  public async getOrCreateConversation(
    userId1: string,
    userId2: string
  ): Promise<{ conversation: Conversation; isNew: boolean }> {
    if (userId1 === userId2)
      throw new Error('Cannot create a conversation with yourself');

    const user1 = await this.getUserById(userId1);
    if (!user1) throw new Error('User not found');

    const user2 = await this.getUserById(userId2);
    if (!user2) throw new Error('Target user not found');

    const existing = await this.db.getConversationByParticipants(
      userId1,
      userId2
    );
    if (existing) return { conversation: existing, isNew: false };

    const conversationId = GeneralStorageProvider.generateConversationId(
      userId1,
      userId2
    );

    const conversation: Conversation = {
      id: conversationId,
      participants: [userId1, userId2].sort() as [string, string],
      createdAt: Date.now()
    };

    await this.db.createConversation(conversation);

    this.emitEvent({
      type: 'NEW_CONVERSATION',
      payload: conversation
    });

    return { conversation, isNew: true };
  }

  /**
   * @description Get a conversation by ID.
   */
  public async getConversationById(id: string): Promise<Conversation | null> {
    return await this.db.getConversationById(id);
  }

  /**
   * @description List all conversations for a user.
   */
  public async listConversationsForUser(
    userId: string
  ): Promise<Conversation[]> {
    return await this.db.listConversationsForUser(userId);
  }

  /**
   * @description Create a direct message in a conversation.
   */
  public async createDirectMessage(
    content: string,
    authorId: string,
    conversationId: string,
    images: string[] = []
  ): Promise<Message> {
    const user = await this.getUserById(authorId);
    if (!user) throw new Error('Author not found');

    const conversation = await this.getConversationById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (!conversation.participants.includes(authorId))
      throw new Error('You are not a participant in this conversation');

    const now = Date.now();

    const message: Message = {
      id: this.id.custom(idName),
      author: {
        id: authorId,
        userName: user.userName
      },
      images,
      content,
      channelId: conversationId, // Reuse channelId for conversation ID
      createdAt: now,
      updatedAt: now,
      reactions: {}
    };

    await this.db.createMessage(message);

    // Update conversation's lastMessageAt
    conversation.lastMessageAt = now;
    conversation.updatedAt = now;
    await this.db.updateConversation(conversation);

    this.emitEvent({
      type: 'NEW_DM_MESSAGE',
      payload: { ...message, participants: conversation.participants }
    });

    return message;
  }

  /**
   * @description Get all messages in a conversation.
   */
  public async getMessagesByConversation(
    conversationId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    return await this.db.listMessagesByConversation(conversationId, options);
  }

  /**
   * @description Update a direct message.
   */
  public async updateDirectMessage(
    id: string,
    userId: string,
    content?: string,
    images?: string[]
  ): Promise<{ message: Message; removedImages: string[] }> {
    const message = await this.getMessageById(id);
    if (!message) throw new Error('Message not found');

    // Verify it's a DM (channelId starts with 'dm:')
    if (!message.channelId.startsWith('dm:'))
      throw new Error('Message is not a direct message');

    if (message.author.id !== userId)
      throw new Error('You can only edit your own messages');

    let removedImages: string[] = [];

    if (content) message.content = content;
    if (images) {
      const currentImages = message.images || [];
      removedImages = currentImages.filter((img) => !images.includes(img));
      message.images = images;
    }
    message.updatedAt = Date.now();

    await this.db.updateMessage(message);

    const conversation = await this.getConversationById(message.channelId);
    const participants = conversation?.participants || [userId, ''];

    this.emitEvent({
      type: 'UPDATE_DM_MESSAGE',
      payload: { ...message, participants }
    });

    return { message, removedImages };
  }

  /**
   * @description Delete a direct message.
   * Note: Only the author can delete DM messages (no admin override for privacy).
   */
  public async deleteDirectMessage(id: string, userId: string): Promise<void> {
    const message = await this.getMessageById(id);
    if (!message) throw new Error('Message not found');

    // Verify it's a DM (channelId starts with 'dm:')
    if (!message.channelId.startsWith('dm:'))
      throw new Error('Message is not a direct message');

    // Only the author can delete DM messages (privacy)
    if (message.author.id !== userId)
      throw new Error('You can only delete your own messages');

    const conversation = await this.getConversationById(message.channelId);
    const participants = conversation?.participants || [userId, ''];

    await this.db.deleteMessage(id);

    this.emitEvent({
      type: 'DELETE_DM_MESSAGE',
      payload: { id, conversationId: message.channelId, participants }
    });
  }

  ////////////////////
  // Thread methods //
  ////////////////////

  /**
   * @description Create a reply in a thread. If this is the first reply,
   * it effectively starts the thread on the parent message.
   */
  public async createThreadReply(
    content: string,
    authorId: string,
    parentMessageId: string,
    images: string[] = []
  ): Promise<{ reply: Message; parentMessage: Message }> {
    const user = await this.getUserById(authorId);
    if (!user) throw new Error('Author not found');

    const parentMessage = await this.getMessageById(parentMessageId);
    if (!parentMessage) throw new Error('Parent message not found');

    if (parentMessage.threadId)
      throw new Error('Cannot create a thread on a thread reply');

    const now = Date.now();

    const reply: Message = {
      id: this.id.custom(idName),
      author: {
        id: authorId,
        userName: user.userName
      },
      images,
      content,
      channelId: parentMessage.channelId,
      threadId: parentMessageId,
      createdAt: now,
      updatedAt: now,
      reactions: {}
    };

    await this.db.createMessage(reply);

    const threadReplies = await this.db.listMessagesByThread(parentMessageId);
    const participants = [...new Set(threadReplies.map((r) => r.author.id))];

    parentMessage.threadMeta = {
      replyCount: threadReplies.length,
      lastReplyAt: now,
      lastReplyBy: {
        id: authorId,
        userName: user.userName
      },
      participants
    };
    parentMessage.updatedAt = now;

    await this.db.updateMessage(parentMessage);

    this.emitEvent({
      type: 'NEW_THREAD_REPLY',
      payload: {
        parentMessageId,
        channelId: parentMessage.channelId,
        reply,
        threadMeta: parentMessage.threadMeta
      }
    });

    return { reply, parentMessage };
  }

  /**
   * @description Get all replies in a thread.
   */
  public async getThreadReplies(
    parentMessageId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    return await this.db.listMessagesByThread(parentMessageId, options);
  }

  /**
   * @description Update a thread reply message.
   */
  public async updateThreadReply(
    id: string,
    userId: string,
    content?: string,
    images?: string[]
  ): Promise<{ message: Message; removedImages: string[] }> {
    const message = await this.getMessageById(id);
    if (!message) throw new Error('Message not found');

    if (!message.threadId) throw new Error('Message is not a thread reply');

    if (message.author.id !== userId)
      throw new Error('You can only edit your own messages');

    let removedImages: string[] = [];

    if (content) message.content = content;
    if (images) {
      const currentImages = message.images || [];
      removedImages = currentImages.filter((img) => !images.includes(img));
      message.images = images;
    }
    message.updatedAt = Date.now();

    await this.db.updateMessage(message);

    this.emitEvent({
      type: 'UPDATE_THREAD_REPLY',
      payload: message
    });

    return { message, removedImages };
  }

  /**
   * @description Delete a thread reply. Updates the parent's threadMeta.
   */
  public async deleteThreadReply(id: string, userId: string): Promise<void> {
    const message = await this.getMessageById(id);
    if (!message) throw new Error('Message not found');

    if (!message.threadId) throw new Error('Message is not a thread reply');

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (message.author.id !== userId && !user.isAdmin)
      throw new Error('You can only delete your own messages');

    const parentMessageId = message.threadId;
    await this.db.deleteMessage(id);

    const parentMessage = await this.getMessageById(parentMessageId);
    let threadMeta: ThreadMeta | null = null;

    if (parentMessage) {
      const remainingReplies =
        await this.db.listMessagesByThread(parentMessageId);

      if (remainingReplies.length === 0) {
        delete parentMessage.threadMeta;
      } else {
        const lastReply = remainingReplies[remainingReplies.length - 1];
        const participants = [
          ...new Set(remainingReplies.map((r) => r.author.id))
        ];

        parentMessage.threadMeta = {
          replyCount: remainingReplies.length,
          lastReplyAt: lastReply.createdAt,
          lastReplyBy: lastReply.author,
          participants
        };
      }
      parentMessage.updatedAt = Date.now();
      await this.db.updateMessage(parentMessage);
      threadMeta = parentMessage.threadMeta || null;
    }

    this.emitEvent({
      type: 'DELETE_THREAD_REPLY',
      payload: {
        id,
        threadId: parentMessageId,
        channelId: message.channelId,
        threadMeta
      }
    });
  }

  /////////////////////
  // Webhook methods //
  /////////////////////

  /**
   * @description Create a new webhook for a channel. Admin only.
   */
  public async createWebhook(
    name: string,
    channelId: string,
    createdBy: string
  ): Promise<Webhook> {
    const user = await this.getUserById(createdBy);
    if (!user) throw new Error('User not found');
    if (!user.isAdmin)
      throw new Error('Only administrators can create webhooks');

    const channel = await this.db.getChannelById(channelId);
    if (!channel) throw new Error('Channel not found');

    const webhook: Webhook = {
      id: this.id.custom(idName),
      name,
      channelId,
      token: randomBytes(32).toString('hex'),
      createdAt: Date.now(),
      createdBy
    };

    await this.db.createWebhook(webhook);

    this.emitEvent({
      type: 'NEW_WEBHOOK',
      payload: {
        id: webhook.id,
        name: webhook.name,
        channelId: webhook.channelId
      }
    });

    return webhook;
  }

  /**
   * @description Delete a webhook. Admin only.
   */
  public async deleteWebhook(webhookId: string, userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    if (!user.isAdmin)
      throw new Error('Only administrators can delete webhooks');

    const webhook = await this.db.getWebhookById(webhookId);
    if (!webhook) throw new Error('Webhook not found');

    await this.db.deleteWebhook(webhookId);

    this.emitEvent({
      type: 'DELETE_WEBHOOK',
      payload: { id: webhookId, channelId: webhook.channelId }
    });
  }

  /**
   * @description List all webhooks. Admin only.
   */
  public async listWebhooks(userId: string): Promise<Webhook[]> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    if (!user.isAdmin) throw new Error('Only administrators can list webhooks');

    return await this.db.listWebhooks();
  }

  /**
   * @description Get a webhook by its ID.
   */
  public async getWebhookById(id: string): Promise<Webhook | null> {
    return await this.db.getWebhookById(id);
  }

  /**
   * @description Get a webhook by its token. Used for authentication.
   */
  public async getWebhookByToken(token: string): Promise<Webhook | null> {
    return await this.db.getWebhookByToken(token);
  }

  /**
   * @description Send a message as a webhook bot.
   */
  public async createWebhookMessage(
    content: string,
    webhook: Webhook
  ): Promise<Message> {
    const channel = await this.db.getChannelById(webhook.channelId);
    if (!channel) throw new Error('Channel not found');

    const now = Date.now();

    const message: Message = {
      id: this.id.custom(idName),
      author: {
        id: `webhook:${webhook.id}`,
        userName: webhook.name,
        isBot: true
      },
      content,
      channelId: webhook.channelId,
      createdAt: now,
      updatedAt: now,
      reactions: {}
    };

    await this.db.createMessage(message);

    this.emitEvent({
      type: 'NEW_MESSAGE',
      payload: message
    });

    return message;
  }

  ////////////////////
  // Event handling //
  ////////////////////

  /**
   * @description Emit a Server Sent Event.
   * @emits
   */
  private emitEvent(event: ServerSentEvent): void {
    console.log(`Emitting event ${event.type}`, event.payload);
    this.eventEmitter.emit('sse', event);
  }

  /**
   * @description Subscribe to Server Sent Events.
   * @subscribes
   */
  public subscribeToEvents(
    callback: (event: ServerSentEvent) => void
  ): () => void {
    const listener = (event: ServerSentEvent) => callback(event);

    this.eventEmitter.on('sse', listener);

    return () => this.eventEmitter.off('sse', listener);
  }
}
