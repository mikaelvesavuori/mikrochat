import type { Channel, DatabaseOperations, Message, User } from '../interfaces';

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

  public async listMessagesByChannel(channelId: string): Promise<Message[]> {
    const messages = await this.db.list<Message>('message:');
    return messages
      .filter((message) => message.channelId === channelId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public async createMessage(message: Message): Promise<void> {
    await this.db.set(`message:${message.id}`, message);
  }

  public async updateMessage(message: Message): Promise<void> {
    await this.db.set(`message:${message.id}`, message);
  }

  public async deleteMessage(id: string): Promise<void> {
    await this.db.delete(`message:${id}`);
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

    // Ensure that the same emoji is never re-added by the same user
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
}
