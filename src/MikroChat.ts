import { EventEmitter } from 'node:events';
import { MikroID } from 'mikroid';

import type {
  Channel,
  ChatConfiguration,
  Message,
  ServerSentEvent,
  User
} from './interfaces';

import type { GeneralStorageProvider } from './providers/GeneralStorageProvider';
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

  constructor(config: ChatConfiguration, db?: any) {
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
    const runEveryNrMinutes = 60; // Run every hour
    const cleanupInterval = 1000 * 60 * runEveryNrMinutes;

    setInterval(async () => {
      const channels = await this.db.listChannels();

      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const cutoffTimestamp =
        Date.now() - this.config.messageRetentionDays * millisecondsPerDay;

      for (const channel of channels) {
        const messages = await this.db.listMessagesByChannel(channel.id);
        for (const message of messages) {
          if (message.createdAt < cutoffTimestamp) {
            await this.db.deleteMessage(message.id);
            this.emitEvent({
              type: 'DELETE_MESSAGE',
              payload: { id: message.id, channelId: channel.id }
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

    const existingChannel = await this.db.getChannelById(id);

    if (existingChannel && existingChannel?.name === this.generalChannelName)
      throw new Error(
        `The ${this.generalChannelName} channel cannot be renamed`
      );

    if (existingChannel && existingChannel?.id !== id)
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

    // Check if we need to remove the oldest message
    const messages = await this.db.listMessagesByChannel(channelId);
    if (messages.length > this.config.maxMessagesPerChannel) {
      const oldestMessage = messages[0];
      await this.db.deleteMessage(oldestMessage.id);

      this.emitEvent({
        type: 'DELETE_MESSAGE',
        payload: { id: oldestMessage.id, channelId }
      });
    }

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

    await this.db.deleteMessage(id);

    this.emitEvent({
      type: 'DELETE_MESSAGE',
      payload: { id, channelId: message.channelId }
    });
  }

  /**
   * @description Get all message in a given channel.
   */
  public async getMessagesByChannel(channelId: string): Promise<Message[]> {
    return await this.db.listMessagesByChannel(channelId);
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
