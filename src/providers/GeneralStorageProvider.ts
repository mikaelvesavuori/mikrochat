import type {
  Channel,
  Conversation,
  DatabaseOperations,
  Message,
  PaginationOptions,
  User,
  Webhook
} from '../interfaces';

export abstract class GeneralStorageProvider {
  protected abstract db: DatabaseOperations;

  //////////////////
  // User methods //
  //////////////////

  public async getUserById(id: string): Promise<User | null> {
    return this.db.get<User>(`user:${id}`);
  }

  public async getUserByUsername(userName: string): Promise<User | null> {
    const users = await this.db.list<User>('user:');
    return users.find((user) => user.userName === userName) || null;
  }

  public async createUser(user: User): Promise<void> {
    await this.db.set(`user:${user.id}`, user);
  }

  public async deleteUser(id: string): Promise<void> {
    await this.db.delete(`user:${id}`);
  }

  public async listUsers(): Promise<User[]> {
    return this.db.list<User>('user:');
  }

  public async getUserByEmail(email: string) {
    const users = await this.db.list<User>('user:');
    return users.find((user) => user.email === email) || null;
  }

  /////////////////////
  // Channel methods //
  /////////////////////

  public async getChannelById(id: string): Promise<Channel | null> {
    return this.db.get<Channel>(`channel:${id}`);
  }

  public async getChannelByName(name: string): Promise<Channel | null> {
    const channels = await this.db.list<Channel>('channel:');
    return channels.find((channel) => channel.name === name) || null;
  }

  public async createChannel(channel: Channel): Promise<void> {
    await this.db.set(`channel:${channel.id}`, channel);
  }

  public async updateChannel(channel: Channel): Promise<void> {
    await this.db.set(`channel:${channel.id}`, channel);
  }

  public async deleteChannel(id: string): Promise<void> {
    await this.db.delete(`channel:${id}`);
    await this.db.delete(`idx:channel-msgs:${id}`);
  }

  public async listChannels(): Promise<Channel[]> {
    return this.db.list<Channel>('channel:');
  }

  /////////////////////
  // Message methods //
  /////////////////////

  public async getMessageById(id: string): Promise<Message | null> {
    return await this.db.get<Message>(`message:${id}`);
  }

  public async listMessagesByChannel(
    channelId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    const index = await this.getIndex(`idx:channel-msgs:${channelId}`);
    return this.paginateAndFetch(index, options);
  }

  public async createMessage(message: Message): Promise<void> {
    await this.db.set(`message:${message.id}`, message);

    if (message.threadId) {
      await this.appendToIndex(`idx:thread-msgs:${message.threadId}`, message.id);
    } else if (message.channelId.startsWith('dm:')) {
      await this.appendToIndex(`idx:conv-msgs:${message.channelId}`, message.id);
    } else {
      await this.appendToIndex(`idx:channel-msgs:${message.channelId}`, message.id);
    }
  }

  public async updateMessage(message: Message): Promise<void> {
    await this.db.set(`message:${message.id}`, message);
  }

  public async deleteMessage(id: string): Promise<void> {
    const message = await this.db.get<Message>(`message:${id}`);
    await this.db.delete(`message:${id}`);

    if (message) {
      if (message.threadId) {
        await this.removeFromIndex(`idx:thread-msgs:${message.threadId}`, id);
      } else if (message.channelId.startsWith('dm:')) {
        await this.removeFromIndex(`idx:conv-msgs:${message.channelId}`, id);
      } else {
        await this.removeFromIndex(`idx:channel-msgs:${message.channelId}`, id);
      }
    }
  }

  //////////////////////
  // Reaction methods //
  //////////////////////

  public async addReaction(
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<Message | null> {
    const message = await this.getMessageById(messageId);
    if (!message) return null;

    if (!message.reactions) message.reactions = {};

    const userReactions = message.reactions[userId] || [];

    if (!userReactions.includes(reaction)) {
      message.reactions[userId] = [...userReactions, reaction];
      await this.updateMessage(message);
    }

    return message;
  }

  public async removeReaction(
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<Message | null> {
    const message = await this.getMessageById(messageId);
    if (!message) return null;
    if (!message.reactions || !message.reactions[userId]) return message;

    message.reactions[userId] = message.reactions[userId].filter(
      (r) => r !== reaction
    );

    await this.updateMessage(message);
    return message;
  }

  ////////////////////
  // Server methods //
  ////////////////////

  public async getServerSettings(): Promise<{ name: string } | null> {
    return this.db.get<{ name: string }>('server:settings');
  }

  public async updateServerSettings(settings: { name: string }): Promise<void> {
    await this.db.set('server:settings', settings);
  }

  //////////////////////////
  // Conversation methods //
  //////////////////////////

  public static generateConversationId(
    userId1: string,
    userId2: string
  ): string {
    const sorted = [userId1, userId2].sort();
    return `dm:${sorted[0]}_${sorted[1]}`;
  }

  public async getConversationById(id: string): Promise<Conversation | null> {
    return this.db.get<Conversation>(`conversation:${id}`);
  }

  public async getConversationByParticipants(
    userId1: string,
    userId2: string
  ): Promise<Conversation | null> {
    const id = GeneralStorageProvider.generateConversationId(userId1, userId2);
    return this.getConversationById(id);
  }

  public async createConversation(conversation: Conversation): Promise<void> {
    await this.db.set(`conversation:${conversation.id}`, conversation);
  }

  public async updateConversation(conversation: Conversation): Promise<void> {
    await this.db.set(`conversation:${conversation.id}`, conversation);
  }

  public async listConversationsForUser(
    userId: string
  ): Promise<Conversation[]> {
    const conversations = await this.db.list<Conversation>('conversation:');
    return conversations
      .filter((conv) => conv.participants.includes(userId))
      .sort(
        (a, b) =>
          (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)
      );
  }

  public async listMessagesByConversation(
    conversationId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    const index = await this.getIndex(`idx:conv-msgs:${conversationId}`);
    return this.paginateAndFetch(index, options);
  }

  ////////////////////
  // Thread methods //
  ////////////////////

  public async listMessagesByThread(
    threadId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    const index = await this.getIndex(`idx:thread-msgs:${threadId}`);
    return this.paginateAndFetch(index, options);
  }

  /////////////////////
  // Webhook methods //
  /////////////////////

  public async getWebhookById(id: string): Promise<Webhook | null> {
    return this.db.get<Webhook>(`webhook:${id}`);
  }

  public async getWebhookByToken(token: string): Promise<Webhook | null> {
    const webhooks = await this.db.list<Webhook>('webhook:');
    return webhooks.find((w) => w.token === token) || null;
  }

  public async listWebhooks(): Promise<Webhook[]> {
    return this.db.list<Webhook>('webhook:');
  }

  public async listWebhooksByChannel(channelId: string): Promise<Webhook[]> {
    const webhooks = await this.db.list<Webhook>('webhook:');
    return webhooks.filter((w) => w.channelId === channelId);
  }

  public async createWebhook(webhook: Webhook): Promise<void> {
    await this.db.set(`webhook:${webhook.id}`, webhook);
  }

  public async deleteWebhook(id: string): Promise<void> {
    await this.db.delete(`webhook:${id}`);
  }

  /////////////////////////////
  // Secondary index helpers //
  /////////////////////////////

  public async getIndex(key: string): Promise<string[]> {
    return (await this.db.get<string[]>(key)) || [];
  }

  private async appendToIndex(key: string, id: string): Promise<void> {
    const index = await this.getIndex(key);
    index.push(id);
    await this.db.set(key, index);
  }

  private async removeFromIndex(key: string, id: string): Promise<void> {
    const index = await this.getIndex(key);
    const filtered = index.filter((i) => i !== id);
    await this.db.set(key, filtered);
  }

  /**
   * @description Given an ordered array of message IDs and pagination options,
   * slice and fetch the actual message records.
   * IDs in the index are ordered oldest-first (by insertion time).
   * Without `before`, returns the latest `limit` messages (oldest-first).
   * With `before`, returns `limit` messages before the cursor (oldest-first).
   */
  private async paginateAndFetch(
    index: string[],
    options?: PaginationOptions
  ): Promise<Message[]> {
    if (index.length === 0) return [];

    const limit = options?.limit ?? 0;
    const before = options?.before;

    let sliced: string[];

    if (before) {
      const cursorPos = index.indexOf(before);
      if (cursorPos <= 0) return [];
      const start = limit > 0 ? Math.max(0, cursorPos - limit) : 0;
      sliced = index.slice(start, cursorPos);
    } else if (limit > 0) {
      sliced = index.slice(-limit);
    } else {
      sliced = index;
    }

    const messages: Message[] = [];
    for (const id of sliced) {
      const msg = await this.db.get<Message>(`message:${id}`);
      if (msg) messages.push(msg);
    }

    return messages.sort((a, b) => a.createdAt - b.createdAt);
  }
}
