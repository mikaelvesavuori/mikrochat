import type { MikroAuth } from 'mikroauth';
import type { MikroChat } from '../MikroChat';

type UnixTimestamp = number;

export type User = {
  id: string;
  userName: string;
  email: string;
  isAdmin: boolean;
  createdAt: UnixTimestamp;
  addedBy?: string;
};

export type Channel = {
  id: string;
  name: string;
  createdAt?: UnixTimestamp;
  updatedAt?: UnixTimestamp;
  createdBy?: string;
};

export type Message = {
  id: string;
  content: string;
  author: {
    id: string;
    userName: string;
  };
  images?: string[];
  channelId: string;
  createdAt: UnixTimestamp;
  updatedAt?: UnixTimestamp;
  reactions: Record<string, string[]>;
};

export type ChatConfiguration = {
  initialUser: {
    id: string;
    userName: string;
    email: string;
  };
  messageRetentionDays: number;
  maxMessagesPerChannel: number;
};

export type ServerSettings = {
  config: ServerConfiguration;
  auth: MikroAuth;
  chat: MikroChat;
  devMode: boolean;
  isInviteRequired: boolean;
};

export type ServerSentEvent =
  // Messages
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: Message }
  | { type: 'DELETE_MESSAGE'; payload: { id: string; channelId: string } }
  // Channels
  | { type: 'NEW_CHANNEL'; payload: Channel }
  | { type: 'DELETE_CHANNEL'; payload: Channel }
  | { type: 'UPDATE_CHANNEL'; payload: Channel }
  // Reactions
  | {
      type: 'NEW_REACTION';
      payload: { messageId: string; userId: string; reaction: string };
    }
  | {
      type: 'DELETE_REACTION';
      payload: { messageId: string; userId: string; reaction: string };
    }
  // Users
  | {
      type: 'NEW_USER';
      payload: { id: string; userName: string; email: string };
    }
  | {
      type: 'REMOVE_USER';
      payload: { id: string; email: string };
    }
  | {
      type: 'USER_EXIT';
      payload: { id: string; userName: string };
    };

export interface DatabaseOperations {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list<T>(prefix: string): Promise<T[]>;
}

/**
 * @description Storage interface for MikroChat.
 */
export interface StorageProvider {
  set(key: string, value: string, expirySeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;

  getUserById(id: string): Promise<User | null>;
  getUserByUsername(userName: string): Promise<User | null>;
  createUser(user: User): Promise<void>;
  listUsers(): Promise<User[]>;

  getChannelById(id: string): Promise<Channel | null>;
  getChannelByName(name: string): Promise<Channel | null>;
  createChannel(channel: Channel): Promise<void>;
  deleteChannel(id: string): Promise<void>;
  listChannels(): Promise<Channel[]>;

  getMessageById(id: string): Promise<Message | null>;
  listMessagesByChannel(channelId: string): Promise<Message[]>;
  createMessage(message: Message): Promise<void>;
  updateMessage(message: Message): Promise<void>;
  deleteMessage(id: string): Promise<void>;

  addReaction(
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<Message | null>;
  removeReaction(messageId: string, userId: string): Promise<Message | null>;

  getServerSettings(): Promise<{ name: string } | null>;
  updateServerSettings(settings: { name: string }): Promise<void>;
}

export type ConfigurationOptions = {
  config?: CombinedOptions;
  configFilePath?: string;
  args?: string[];
};

/**
 * @description Complete set of configurations for
 * authentication, the server, and any other providers.
 */
export type CombinedConfiguration = {
  auth: AuthConfiguration;
  chat: ChatConfiguration;
  email: EmailConfiguration;
  server: ServerConfiguration;
  storage: StorageConfiguration;
  devMode: boolean;
};

/**
 * @description The user-provided set of options for
 * authentication and the server.
 */
export type CombinedOptions = {
  auth: AuthOptions;
  email: EmailOptions;
  server: ServerOptions;
  storage: StorageOptions;
};

export type AuthConfiguration = {
  /**
   * The JSON Web Token secret to use.
   */
  jwtSecret: string;
  /**
   * How many seconds until a magic link expires?
   */
  magicLinkExpirySeconds: number;
  /**
   * How many seconds until the JSON Web Token expires?
   */
  jwtExpirySeconds: number;
  /**
   * How many seconds until the refresh token expires?
   */
  refreshTokenExpirySeconds: number;
  /**
   * How many sessions can be active?
   */
  maxActiveSessions: number;
  /**
   * The URL to the application we are authenticating towards.
   */
  appUrl: string;
  /**
   * Custom email templates.
   */
  templates: EmailTemplateConfiguration | null | undefined;
  /**
   * For a magic link sign in attempt (email creation), must
   * the email address already exist (be invited)?
   */
  isInviteRequired: boolean;
  /**
   * Use debug mode?
   */
  debug: boolean;
};

/**
 * @description Options for configuring MikroAuth.
 */
export type AuthOptions = Partial<AuthConfiguration>;

/**
 * @description Options to configure the server exposing MikroAuth.
 */
export type ServerConfiguration = {
  /**
   * Port to listen on (defaults to PORT env var or 3000)
   */
  port: number;
  /**
   * Host to bind to (defaults to HOST env var or '0.0.0.0')
   */
  host: string;
  /**
   * Whether to use HTTPS instead of HTTP
   */
  useHttps: boolean;
  /**
   * Whether to use HTTPS instead of HTTP
   */
  useHttp2: boolean;
  /**
   * Path to SSL certificate file (required if useHttps is true)
   */
  sslCert: string;
  /**
   * Path to SSL key file (required if useHttps is true)
   */
  sslKey: string;
  /**
   * Path to SSL CA certificate(s) file (optional)
   */
  sslCa: string;
  /**
   * Use debug mode?
   */
  debug: boolean;
};

/**
 * @description Options for configuring the server running MikroAuth.
 */
export type ServerOptions = Partial<ServerConfiguration>;

export type EmailConfiguration = {
  emailSubject: string;
  user: string;
  host: string;
  password: string;
  port: number;
  secure: boolean;
  maxRetries: number;
  debug: boolean;
  // Available in MikroMail but not supported here
  //timeout?: number;
  //clientName?: string;
  //retryDelay?: number;
  //skipAuthentication?: boolean; // Skip authentication step (for test servers)
};

export type EmailOptions = Partial<EmailConfiguration>;

export type StorageConfiguration = {
  databaseDirectory: string;
  encryptionKey: string;
  debug: boolean;
};

export type StorageOptions = Partial<StorageConfiguration>;

/**
 * @description Configuration for magic link email templates.
 * Defines the structure for text and HTML versions of authentication emails.
 */
export type EmailTemplateConfiguration = {
  textVersion: MagicLinkTemplate;
  htmlVersion: MagicLinkTemplate;
};

/**
 * @description Function that generates the text and HTML version of the email.
 * @param magicLink - The authentication link to include in the email.
 * @param expiryMinutes - The number of minutes until the link expires.
 * @returns The formatted text or HTML content for the email.
 */
export type MagicLinkTemplate = (
  magicLink: string,
  expiryMinutes: number
) => string;
