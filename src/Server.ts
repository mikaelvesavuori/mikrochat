import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type http from 'node:http';
import { type Context, MikroServe } from 'mikroserve';

import type { Message, ServerSettings, User } from './interfaces';
import { MikroChat } from './MikroChat';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_IMAGE_SIZE_IN_MB = 2; // TODO: Enable larger images
const VALID_FILE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'svg'];

const MAX_CONNECTIONS_PER_USER = 3;
const CONNECTION_TIMEOUT_MS = 60 * 1000;

const activeConnections = new Map();
const connectionTimeouts = new Map();

/**
 * @description Runs a MikroServe instance to expose MikroChat as an API.
 */
export async function startServer(settings: ServerSettings) {
  const { config, auth, chat, devMode, isInviteRequired, authMode } = settings;

  const server = new MikroServe(config);

  async function enrichMessagesWithAuthors(
    messages: Message[]
  ): Promise<Message[]> {
    const uniqueAuthorIds = [
      ...new Set(
        messages.filter((m) => !m.author.isBot).map((m) => m.author.id)
      )
    ];
    const authors = new Map<string, User>();
    await Promise.all(
      uniqueAuthorIds.map(async (id) => {
        const user = await chat.getUserById(id);
        if (user) authors.set(id, user);
      })
    );
    return messages.map((message) => {
      if (message.author.isBot) return message;
      const author = authors.get(message.author.id);
      return {
        ...message,
        author: {
          id: author?.id || message.author.id,
          userName: author?.userName || 'Unknown User'
        }
      };
    });
  }

  ////////////////////
  // Authentication //
  ////////////////////

  if (devMode) {
    /**
     * @description Sign in (log in) user in development mode.
     * This option will generate a JWT and pass it back to the caller.
     *
     * If an invite is not required to join the server, a new user
     * will be created prior to creating the JWT for the new user.
     */
    server.post('/auth/dev-login', async (c: Context) => {
      if (!c.body.email) return c.json({ error: 'Email is required' }, 400);
      const { email } = c.body;

      let user: User | null = await chat.getUserByEmail(email);

      if (isInviteRequired && !user)
        return c.json({ success: false, message: 'Unauthorized' }, 401);
      if (!user) user = await chat.addUser(email, email, false, true);

      const token = auth.generateJsonWebToken({
        id: user.id,
        username: user.userName,
        email: user.email,
        role: user.isAdmin ? 'admin' : 'user'
      });

      return c.json({ user, token }, 200);
    });
  }

  //////////////////////////
  // Magic Link Auth Mode //
  //////////////////////////

  if (!devMode && authMode !== 'password') {
    /**
     * @description Sign in (log in) user. This uses a magic link email
     * to authenticate the user so a successful response here simply
     * means that the email was sent.
     */
    server.post('/auth/login', async (c: Context) => {
      if (!c.body.email) return c.json({ error: 'Email is required' }, 400);
      const { email } = c.body;

      let message =
        'If a matching account was found, a magic link has been sent.';

      async function createLink() {
        const result = await auth.createMagicLink({
          email
        });

        if (!result)
          return c.json({ error: 'Failed to create magic link' }, 400);

        message = result.message;
      }

      if (isInviteRequired) {
        const user = await chat.getUserByEmail(email);
        if (user) await createLink();
      } else await createLink();

      return c.json(
        {
          success: true,
          message
        },
        200
      );
    });

    /**
     * @description Verify a magic link.
     */
    server.post('/auth/verify', async (c: Context) => {
      const body = c.body;
      const authHeader = c.headers.authorization || '';
      const token = authHeader.split(' ')[1];
      if (!token) return c.json({ error: 'Token is required' }, 400);

      try {
        const result = await auth.verifyToken({
          email: body.email,
          token: token
        });
        if (!result) return c.json({ error: 'Invalid token' }, 400);
        return c.json(result, 200);
      } catch (_error) {
        return c.json({ error: 'Invalid token' }, 400);
      }
    });
  }

  /////////////////////////
  // Password Auth Mode  //
  /////////////////////////

  if (!devMode && authMode === 'password') {
    /**
     * @description Sign in with email and password.
     */
    server.post('/auth/password-login', async (c: Context) => {
      const { email, password } = c.body;
      if (!email || !password)
        return c.json({ error: 'Email and password are required' }, 400);

      try {
        const user = await chat.verifyUserPassword(email, password);
        const tokens = await auth.createToken({
          email: user.email,
          username: user.userName,
          role: user.isAdmin ? 'admin' : 'user'
        });
        return c.json(tokens, 200);
      } catch (_error) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }
    });

    /**
     * @description Set password for an invited user via a magic link token.
     * The invite email uses the same magic link mechanism; the frontend
     * shows a "set password" form instead of auto-verifying.
     */
    server.post('/auth/setup-password', async (c: Context) => {
      const { email, password } = c.body;
      const authHeader = c.headers.authorization || '';
      const token = authHeader.split(' ')[1];

      if (!email || !token)
        return c.json({ error: 'Email and token are required' }, 400);
      if (!password || password.length < 8)
        return c.json({ error: 'Password must be at least 8 characters' }, 400);

      try {
        const tokens = await auth.verifyToken({ email, token });
        if (!tokens) return c.json({ error: 'Invalid or expired token' }, 400);

        const user = await chat.getUserByEmail(email);
        if (!user) return c.json({ error: 'User not found' }, 404);

        await chat.setUserPassword(user.id, password);

        return c.json(tokens, 200);
      } catch (_error) {
        return c.json({ error: 'Invalid or expired token' }, 400);
      }
    });

    /**
     * @description Self-register with email and password.
     * Only available when invites are not required.
     */
    if (!isInviteRequired) {
      server.post('/auth/register', async (c: Context) => {
        const { email, password } = c.body;
        if (!email) return c.json({ error: 'Email is required' }, 400);
        if (!password || password.length < 8)
          return c.json(
            { error: 'Password must be at least 8 characters' },
            400
          );

        try {
          const existingUser = await chat.getUserByEmail(email);
          if (existingUser)
            return c.json({ error: 'User already exists' }, 400);

          const user = await chat.addUser(email, email, false, true);
          await chat.setUserPassword(user.id, password);

          const tokens = await auth.createToken({
            email: user.email,
            username: user.userName,
            role: 'user'
          });
          return c.json(tokens, 200);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'An error occurred';
          return c.json({ error: message }, 400);
        }
      });
    }
  }

  /////////////////////
  // Common Auth     //
  /////////////////////

  /**
   * @description Sign out (log out) user.
   */
  server.post('/auth/logout', authenticate, async (c: Context) => {
    const body = c.body;
    const refreshToken = body.refreshToken;
    if (!refreshToken) return c.json({ error: 'Missing refresh token' }, 400);

    const result = await auth.logout(refreshToken);

    return c.json(result, 200);
  });

  /**
   * @description Get user data for signed-in user.
   */
  server.get('/auth/me', authenticate, async (c: Context) => {
    const user = c.state.user;
    return c.json({ user: user ? MikroChat.sanitizeUser(user) : null }, 200);
  });

  /**
   * @description Refresh a user's access token.
   */
  server.post('/auth/refresh', async (c: Context) => {
    const body = c.body;

    const token = body.refreshToken;

    const result = await auth.refreshAccessToken(token);

    return c.json(result, 200);
  });

  /**
   * @description Get a user's sessions.
   */
  server.get('/auth/sessions', authenticate, async (c: Context) => {
    const authHeader = c.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return c.json(null, 401);

    const body = c.body;
    const token = authHeader.split(' ')[1];
    const payload = auth.verify(token);
    const user = { email: payload.sub };

    const result = await auth.getSessions({ body, user });

    return c.json(result, 200);
  });

  /**
   * @description Delete a user's sessions.
   */
  server.delete('/auth/sessions', authenticate, async (c: Context) => {
    const authHeader = c.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return c.json(null, 401);

    const body = c.body;
    const token = authHeader.split(' ')[1];
    const payload = auth.verify(token);
    const user = { email: payload.sub };

    const result = await auth.revokeSessions({ body, user });

    return c.json(result, 200);
  });

  ///////////
  // Users //
  ///////////

  /**
   * @description Create (add) a new user on the server.
   */
  server.post('/users/add', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { email, role } = c.body;
    if (!email) return c.json({ error: 'Email is required' }, 400);

    try {
      // Ensure only admins can create admin users
      if (role === 'admin' && !user.isAdmin)
        return c.json(
          { error: 'Only administrators can add admin users' },
          403
        );

      const existingUser = await chat.getUserByEmail(email);
      if (existingUser)
        return c.json({ success: false, message: 'User already exists' });

      const userId = await chat.addUser(email, user.id, role === 'admin');

      if (authMode === 'password') {
        try {
          await auth.createMagicLink({ email });
        } catch {
          // Email sending failed, but user was created
        }
      }

      return c.json({ success: true, userId }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Retrieve all data on all users on the server.
   */
  server.get('/users', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const users = await chat.listUsers();
      return c.json({ users: users.map(MikroChat.sanitizeUser) }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Delete a user by ID.
   */
  server.delete('/users/:id', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const userId = c.params.id;

    if (userId === user.id)
      return c.json({ error: 'You cannot remove your own account' }, 400);

    try {
      await chat.removeUser(userId, user.id);
      return c.json({ success: true }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Self-remove user from the server.
   */
  server.post('/users/exit', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      // Check if this is the last admin
      if (user.isAdmin) {
        const admins = (await chat.listUsers()).filter((u: User) => u.isAdmin);
        if (admins.length <= 1) {
          return c.json(
            { error: 'Cannot exit as the last administrator' },
            400
          );
        }
      }

      await chat.exitUser(user.id);

      return c.json(
        { success: true, message: 'You have exited the server' },
        200
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  //////////////
  // Channels //
  //////////////

  /**
   * @description Get all channels on the server.
   */
  server.get('/channels', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channels = await chat.listChannels();
    return c.json({ channels }, 200);
  });

  /**
   * @description Create a new channel on the server.
   */
  server.post('/channels', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { name } = c.body;
    if (!name) return c.json({ error: 'Channel name is required' }, 400);

    try {
      const channel = await chat.createChannel(name, user.id);
      return c.json({ channel }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Get all messages in a channel.
   */
  server.get(
    '/channels/:channelId/messages',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const channelId = c.params.channelId;
      const limit = c.query.limit
        ? parseInt(c.query.limit, 10)
        : DEFAULT_PAGE_LIMIT;
      const before = c.query.before || undefined;

      try {
        const messages = await chat.getMessagesByChannel(channelId, {
          limit,
          before
        });
        const enhancedMessages = await enrichMessagesWithAuthors(messages);

        return c.json({ messages: enhancedMessages }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Create a message in a specific channel.
   */
  server.post(
    '/channels/:channelId/messages',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const channelId = c.params.channelId;
      const content = c.body?.content;
      const images = c.body?.images;

      if (!content && !images)
        return c.json({ error: 'Message content is required' }, 400);

      try {
        const message = await chat.createMessage(content, user.id, channelId);

        return c.json({ message }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Update the information for a channel.
   */
  server.put('/channels/:channelId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channelId = c.params.channelId;
    const { name } = c.body;

    if (!name) return c.json({ error: 'Channel name is required' }, 400);

    try {
      const channel = await chat.updateChannel(channelId, name, user.id);

      return c.json({ channel }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Delete a channel by ID.
   */
  server.delete('/channels/:channelId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channelId = c.params.channelId;

    try {
      await chat.deleteChannel(channelId, user.id);
      return c.json({ success: true }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  //////////////
  // Messages //
  //////////////

  /**
   * @description Update a message by ID.
   */
  server.put('/messages/:messageId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;
    const content = c.body?.content;
    const images = c.body?.images;

    if (!content && !images)
      return c.json({ error: 'Message content is required' }, 400);

    try {
      const { message, removedImages } = await chat.updateMessage(
        messageId,
        user.id,
        content,
        images
      );

      deleteImages(removedImages);

      return c.json({ message }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Delete a message by ID.
   * Any attached images will also be deleted.
   */
  server.delete('/messages/:messageId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;

    try {
      const message = await chat.getMessageById(messageId);
      const images = message?.images || [];

      await chat.deleteMessage(messageId, user.id);

      deleteImages(images);

      return c.json({ success: true }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Add a reaction to a message.
   */
  server.post(
    '/messages/:messageId/reactions',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const messageId = c.params.messageId;
      const { reaction } = c.body;

      if (!reaction) return c.json({ error: 'Reaction is required' }, 400);

      try {
        const message = await chat.addReaction(messageId, user.id, reaction);

        if (!message) {
          return c.json(
            { error: `Message with ID ${messageId} not found` },
            404
          );
        }

        return c.json({ message }, 200);
      } catch (error) {
        console.error(`Error adding reaction to message ${messageId}:`, error);
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Remove a reaction from a message.
   */
  server.delete(
    '/messages/:messageId/reactions',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const messageId = c.params.messageId;
      const { reaction } = c.body;

      if (!reaction) return c.json({ error: 'Reaction is required' }, 400);

      try {
        const message = await chat.removeReaction(messageId, user.id, reaction);

        if (!message) {
          return c.json(
            { error: `Message with ID ${messageId} not found` },
            404
          );
        }

        return c.json({ message }, 200);
      } catch (error) {
        console.error(
          `Error removing reaction from message ${messageId}:`,
          error
        );
        const errorMessage =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: errorMessage }, 400);
      }
    }
  );

  /////////////
  // Threads //
  /////////////

  /**
   * @description Get all replies in a thread.
   */
  server.get(
    '/messages/:messageId/thread',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const messageId = c.params.messageId;
      const limit = c.query.limit
        ? parseInt(c.query.limit, 10)
        : DEFAULT_PAGE_LIMIT;
      const before = c.query.before || undefined;

      try {
        const replies = await chat.getThreadReplies(messageId, {
          limit,
          before
        });
        const enhancedReplies = await enrichMessagesWithAuthors(replies);

        return c.json({ replies: enhancedReplies }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Create a thread reply on a message.
   */
  server.post(
    '/messages/:messageId/thread',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const parentMessageId = c.params.messageId;
      const content = c.body?.content;
      const images = c.body?.images;

      if (!content && !images)
        return c.json({ error: 'Message content is required' }, 400);

      try {
        const { reply, parentMessage } = await chat.createThreadReply(
          content,
          user.id,
          parentMessageId,
          images || []
        );

        return c.json({ reply, threadMeta: parentMessage.threadMeta }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Update a thread reply.
   */
  server.put(
    '/messages/:messageId/thread/:replyId',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const replyId = c.params.replyId;
      const content = c.body?.content;
      const images = c.body?.images;

      if (!content && !images)
        return c.json({ error: 'Message content is required' }, 400);

      try {
        const { message, removedImages } = await chat.updateThreadReply(
          replyId,
          user.id,
          content,
          images
        );

        deleteImages(removedImages);

        return c.json({ message }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Delete a thread reply.
   */
  server.delete(
    '/messages/:messageId/thread/:replyId',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const replyId = c.params.replyId;

      try {
        const reply = await chat.getMessageById(replyId);
        const images = reply?.images || [];

        await chat.deleteThreadReply(replyId, user.id);

        deleteImages(images);

        return c.json({ success: true }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Upload an image for a thread reply.
   */
  server.post(
    '/messages/:messageId/thread/image',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      try {
        const { filename, image, thumbnail } = c.body;

        if (!image) return c.json({ error: 'No image provided' }, 400);

        const fileExtension = filename.split('.').pop();
        if (!fileExtension)
          return c.json({ error: 'Missing file extension' }, 400);

        if (!VALID_FILE_FORMATS.includes(fileExtension))
          return c.json({ error: 'Unsupported file format' }, 400);

        const imageBuffer = Buffer.from(image, 'base64');

        const maxImageSize = MAX_IMAGE_SIZE_IN_MB * 1024 * 1024;
        if (imageBuffer.length > maxImageSize)
          return c.json({ error: 'Image too large' }, 400);

        const uploadDirectory = `${process.cwd()}/uploads`;
        if (!existsSync(uploadDirectory)) mkdirSync(uploadDirectory);

        const savedFileName = `${Date.now()}-${randomBytes(16).toString('hex')}.${fileExtension}`;
        const uploadPath = join(uploadDirectory, savedFileName);

        writeFileSync(uploadPath, imageBuffer);

        if (thumbnail) saveThumbnail(uploadDirectory, savedFileName, thumbnail);

        return c.json({
          success: true,
          filename: savedFileName
        });
      } catch (error) {
        console.error('Image upload error:', error);
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed'
          },
          500
        );
      }
    }
  );

  ///////////////////
  // Conversations //
  ///////////////////

  /**
   * @description Get all conversations for the authenticated user.
   */
  server.get('/conversations', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const conversations = await chat.listConversationsForUser(user.id);

      // Batch-fetch unique participant users
      const otherUserIds = [
        ...new Set(
          conversations
            .map((conv) => conv.participants.find((p) => p !== user.id))
            .filter(Boolean)
        )
      ] as string[];
      const userMap = new Map<string, User>();
      await Promise.all(
        otherUserIds.map(async (id) => {
          const u = await chat.getUserById(id);
          if (u) userMap.set(id, u);
        })
      );

      const enhancedConversations = conversations.map((conv) => {
        const otherUserId = conv.participants.find((p) => p !== user.id);
        const otherUser = otherUserId ? userMap.get(otherUserId) : null;
        return {
          ...conv,
          otherUser: otherUser
            ? { id: otherUser.id, userName: otherUser.userName }
            : null
        };
      });

      return c.json({ conversations: enhancedConversations }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Create or get a conversation with another user.
   */
  server.post('/conversations', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { targetUserId } = c.body;
    if (!targetUserId)
      return c.json({ error: 'Target user ID is required' }, 400);

    try {
      const { conversation, isNew } = await chat.getOrCreateConversation(
        user.id,
        targetUserId
      );

      // Get other user info
      const otherUser = await chat.getUserById(targetUserId);

      return c.json(
        {
          conversation: {
            ...conversation,
            otherUser: otherUser
              ? { id: otherUser.id, userName: otherUser.userName }
              : null
          },
          isNew
        },
        200
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Get all messages in a conversation.
   */
  server.get(
    '/conversations/:conversationId/messages',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const conversationId = c.params.conversationId;

      try {
        const conversation = await chat.getConversationById(conversationId);
        if (!conversation)
          return c.json({ error: 'Conversation not found' }, 404);

        if (!conversation.participants.includes(user.id))
          return c.json(
            { error: 'You are not a participant in this conversation' },
            403
          );

        const limit = c.query.limit
          ? parseInt(c.query.limit, 10)
          : DEFAULT_PAGE_LIMIT;
        const before = c.query.before || undefined;
        const messages = await chat.getMessagesByConversation(conversationId, {
          limit,
          before
        });
        const enhancedMessages = await enrichMessagesWithAuthors(messages);

        return c.json({ messages: enhancedMessages }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Send a direct message in a conversation.
   */
  server.post(
    '/conversations/:conversationId/messages',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const conversationId = c.params.conversationId;
      const content = c.body?.content;
      const images = c.body?.images;

      if (!content && !images)
        return c.json({ error: 'Message content is required' }, 400);

      try {
        const message = await chat.createDirectMessage(
          content,
          user.id,
          conversationId,
          images
        );

        return c.json({ message }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Update a direct message.
   */
  server.put(
    '/conversations/:conversationId/messages/:messageId',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const messageId = c.params.messageId;
      const content = c.body?.content;
      const images = c.body?.images;

      if (!content && !images)
        return c.json({ error: 'Message content is required' }, 400);

      try {
        const { message, removedImages } = await chat.updateDirectMessage(
          messageId,
          user.id,
          content,
          images
        );

        deleteImages(removedImages);

        return c.json({ message }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Delete a direct message.
   */
  server.delete(
    '/conversations/:conversationId/messages/:messageId',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const messageId = c.params.messageId;

      try {
        const message = await chat.getMessageById(messageId);
        const images = message?.images || [];

        await chat.deleteDirectMessage(messageId, user.id);

        deleteImages(images);

        return c.json({ success: true }, 200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Upload an image for a direct message.
   */
  server.post(
    '/conversations/:conversationId/messages/image',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const conversationId = c.params.conversationId;

      try {
        // Verify user is participant in conversation
        const conversation = await chat.getConversationById(conversationId);
        if (!conversation)
          return c.json({ error: 'Conversation not found' }, 404);

        if (!conversation.participants.includes(user.id))
          return c.json(
            { error: 'You are not a participant in this conversation' },
            403
          );

        const { filename, image, thumbnail } = c.body;

        if (!image) return c.json({ error: 'No image provided' }, 400);

        const fileExtension = filename.split('.').pop();
        if (!fileExtension)
          return c.json({ error: 'Missing file extension' }, 400);

        if (!VALID_FILE_FORMATS.includes(fileExtension))
          return c.json({ error: 'Unsupported file format' }, 400);

        const imageBuffer = Buffer.from(image, 'base64');

        const maxImageSize = MAX_IMAGE_SIZE_IN_MB * 1024 * 1024;
        if (imageBuffer.length > maxImageSize)
          return c.json({ error: 'Image too large' }, 400);

        const uploadDirectory = `${process.cwd()}/uploads`;
        if (!existsSync(uploadDirectory)) mkdirSync(uploadDirectory);

        const savedFileName = `${Date.now()}-${randomBytes(16).toString('hex')}.${fileExtension}`;
        const uploadPath = join(uploadDirectory, savedFileName);

        writeFileSync(uploadPath, imageBuffer);

        if (thumbnail) saveThumbnail(uploadDirectory, savedFileName, thumbnail);

        return c.json({
          success: true,
          filename: savedFileName
        });
      } catch (error) {
        console.error('Image upload error:', error);
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed'
          },
          500
        );
      }
    }
  );

  /**
   * @description Get an image from a direct message.
   */
  server.get(
    '/conversations/:conversationId/messages/image/:filename',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const conversationId = c.params.conversationId;

      try {
        // Verify user is participant in conversation
        const conversation = await chat.getConversationById(conversationId);
        if (!conversation)
          return c.json({ error: 'Conversation not found' }, 404);

        if (!conversation.participants.includes(user.id))
          return c.json(
            { error: 'You are not a participant in this conversation' },
            403
          );

        const { filename } = c.params;

        // Prevent path traversal attacks
        if (
          filename.includes('..') ||
          filename.includes('/') ||
          filename.includes('\\')
        )
          return c.json({ error: 'Invalid filename' }, 400);

        const uploadDirectory = `${process.cwd()}/uploads`;

        // Serve thumbnail if requested and available
        const serveThumbnail = c.query.size === 'thumb';
        const thumbPath = join(uploadDirectory, `thumb-${filename}`);
        const filePath =
          serveThumbnail && existsSync(thumbPath)
            ? thumbPath
            : join(uploadDirectory, filename);

        // Double-check the resolved path is within uploads directory
        if (!filePath.startsWith(uploadDirectory))
          return c.json({ error: 'Invalid filename' }, 400);

        if (!existsSync(filePath))
          return c.json({ error: 'Image not found' }, 404);

        const imageBuffer = readFileSync(filePath);

        const fileExtension =
          serveThumbnail && existsSync(thumbPath)
            ? 'jpg'
            : filename.split('.').pop()?.toLowerCase();
        let contentType = 'application/octet-stream'; // Default

        if (fileExtension === 'jpg' || fileExtension === 'jpeg')
          contentType = 'image/jpeg';
        else if (fileExtension === 'png') contentType = 'image/png';
        else if (fileExtension === 'webp') contentType = 'image/webp';
        else if (fileExtension === 'svg') contentType = 'image/svg+xml';

        return c.binary(imageBuffer, contentType);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Image fetch failed'
          },
          500
        );
      }
    }
  );

  ////////////
  // Images //
  ////////////

  /**
   * @description Add an image to an existing message.
   */
  server.post(
    '/channels/:channelId/messages/image',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      try {
        const { filename, image, thumbnail } = c.body;

        if (!image) return c.json({ error: 'No image provided' }, 400);

        const fileExtension = filename.split('.').pop();
        if (!fileExtension)
          return c.json({ error: 'Missing file extension' }, 400);

        if (!VALID_FILE_FORMATS.includes(fileExtension))
          return c.json({ error: 'Unsupported file format' }, 400);

        const imageBuffer = Buffer.from(image, 'base64');

        const maxImageSize = MAX_IMAGE_SIZE_IN_MB * 1024 * 1024;
        if (imageBuffer.length > maxImageSize)
          return c.json({ error: 'Image too large' }, 400);

        const uploadDirectory = `${process.cwd()}/uploads`;
        if (!existsSync(uploadDirectory)) mkdirSync(uploadDirectory);

        const savedFileName = `${Date.now()}-${randomBytes(16).toString('hex')}.${fileExtension}`;
        const uploadPath = join(uploadDirectory, savedFileName);

        writeFileSync(uploadPath, imageBuffer);

        if (thumbnail) saveThumbnail(uploadDirectory, savedFileName, thumbnail);

        return c.json({
          success: true,
          filename: savedFileName
        });
      } catch (error) {
        console.error('Image upload error:', error);
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed'
          },
          500
        );
      }
    }
  );

  /**
   * @description Get an image by file name, as the stored file is named on the server.
   */
  server.get(
    '/channels/:channelId/messages/image/:filename',
    authenticate,
    async (c: Context) => {
      const user = c.state.user;
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      try {
        const { filename } = c.params;

        // Prevent path traversal attacks
        if (
          filename.includes('..') ||
          filename.includes('/') ||
          filename.includes('\\')
        )
          return c.json({ error: 'Invalid filename' }, 400);

        const uploadDirectory = `${process.cwd()}/uploads`;

        // Serve thumbnail if requested and available
        const serveThumbnail = c.query.size === 'thumb';
        const thumbPath = join(uploadDirectory, `thumb-${filename}`);
        const filePath =
          serveThumbnail && existsSync(thumbPath)
            ? thumbPath
            : join(uploadDirectory, filename);

        // Double-check the resolved path is within uploads directory
        if (!filePath.startsWith(uploadDirectory))
          return c.json({ error: 'Invalid filename' }, 400);

        if (!existsSync(filePath))
          return c.json({ error: 'Image not found' }, 404);

        const imageBuffer = readFileSync(filePath);

        const fileExtension =
          serveThumbnail && existsSync(thumbPath)
            ? 'jpg'
            : filename.split('.').pop()?.toLowerCase();
        let contentType = 'application/octet-stream'; // Default

        if (fileExtension === 'jpg' || fileExtension === 'jpeg')
          contentType = 'image/jpeg';
        else if (fileExtension === 'png') contentType = 'image/png';
        else if (fileExtension === 'webp') contentType = 'image/webp';
        else if (fileExtension === 'svg') contentType = 'image/svg+xml';

        return c.binary(imageBuffer, contentType);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Image fetch failed'
          },
          500
        );
      }
    }
  );

  /////////////////////
  // Server settings //
  /////////////////////

  /**
   * @description Get server settings.
   */
  server.get('/server/settings', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const settings = await chat.getServerSettings();
      return c.json(settings || { name: 'MikroChat' }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Update server settings.
   */
  server.put('/server/settings', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { name } = c.body;

    if (!name) return c.json({ error: 'Server name is required' }, 400);

    try {
      await chat.updateServerSettings({ name });
      return c.json({ name }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  //////////////
  // Webhooks //
  //////////////

  /**
   * @description List all webhooks. Admin only.
   */
  server.get('/webhooks', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const webhooks = await chat.listWebhooks(user.id);
      const sanitized = webhooks.map(({ token, ...rest }) => rest);
      return c.json({ webhooks: sanitized }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Create a new webhook. Admin only.
   * The token is returned only in this response.
   */
  server.post('/webhooks', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { name, channelId } = c.body;
    if (!name) return c.json({ error: 'Webhook name is required' }, 400);
    if (!channelId) return c.json({ error: 'Channel ID is required' }, 400);

    try {
      const webhook = await chat.createWebhook(name, channelId, user.id);
      return c.json({ webhook }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Delete a webhook. Admin only.
   */
  server.delete('/webhooks/:webhookId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const webhookId = c.params.webhookId;

    try {
      await chat.deleteWebhook(webhookId, user.id);
      return c.json({ success: true }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Post a message via webhook.
   * Uses webhook token authentication (not JWT).
   */
  server.post('/webhooks/:webhookId/messages', async (c: Context) => {
    const webhookId = c.params.webhookId;
    const content = c.body?.content;

    if (!content) return c.json({ error: 'Message content is required' }, 400);

    const authHeader = c.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return c.json({ error: 'Webhook token is required' }, 401);

    const token = authHeader.split(' ')[1];
    if (!token) return c.json({ error: 'Webhook token is required' }, 401);

    try {
      const webhook = await chat.getWebhookByToken(token);
      if (!webhook) return c.json({ error: 'Invalid webhook token' }, 401);

      if (webhook.id !== webhookId)
        return c.json(
          { error: 'Webhook token does not match webhook ID' },
          403
        );

      const message = await chat.createWebhookMessage(content, webhook);
      return c.json({ message }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  //////////////////////////////
  // Server Sent Events (SSE) //
  //////////////////////////////

  /**
   * @description Set up connection with Server Sent Events.
   */
  server.get('/events', async (c: Context) => {
    // Parse token from query parameter if present (for EventSource which can't set headers)
    let user = null;
    const token = c.query.token;
    if (token) {
      try {
        const payload = auth.verify(token);
        user = await chat.getUserByEmail(payload.email || payload.sub);
      } catch (error) {
        console.error('SSE token validation error:', error);
      }
    }

    // If no token in query, try the Authorization header
    if (!user && c.headers.authorization?.startsWith('Bearer ')) {
      const headerToken = c.headers.authorization.substring(7);
      try {
        const payload = auth.verify(headerToken);
        user = await chat.getUserByEmail(payload.email || payload.sub);
      } catch (error) {
        console.error('SSE header validation error:', error);
      }
    }

    if (!user) {
      console.log('SSE unauthorized access attempt');
      return {
        statusCode: 401,
        body: { error: 'Unauthorized' },
        headers: { 'Content-Type': 'application/json' }
      };
    }

    const connectionId = randomBytes(8).toString('hex');

    if (activeConnections.has(user.id)) {
      const now = Date.now();

      const userConnections = activeConnections.get(user.id);
      const staleConnectionIds: string[] = [];

      userConnections.forEach((connectionId: string) => {
        const lastActivity = connectionTimeouts.get(connectionId) || 0;
        if (now - lastActivity > CONNECTION_TIMEOUT_MS) {
          staleConnectionIds.push(connectionId);
        }
      });

      // Remove stale connections
      staleConnectionIds.forEach((connectionId) => {
        userConnections.delete(connectionId);
        connectionTimeouts.delete(connectionId);
        console.log(
          `Cleaned up stale connection ${connectionId} for user ${user.id}`
        );
      });

      // If the user is requesting a new connection but already has active ones,
      // prioritize this new connection by removing the oldest one if at limit
      if (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
        let oldestConnectionId = null;
        let oldestTime = Number.POSITIVE_INFINITY;

        userConnections.forEach((connectionId: string) => {
          const lastActivity = connectionTimeouts.get(connectionId) || 0;
          if (lastActivity < oldestTime) {
            oldestTime = lastActivity;
            oldestConnectionId = connectionId;
          }
        });

        if (oldestConnectionId) {
          userConnections.delete(oldestConnectionId);
          connectionTimeouts.delete(oldestConnectionId);
          console.log(
            `Removed oldest connection ${oldestConnectionId} for user ${user.id} to make room`
          );
        }
      }
    } else {
      activeConnections.set(user.id, new Set());
    }

    const userConnections = activeConnections.get(user.id);
    userConnections.add(connectionId);

    // Set initial activity timestamp
    connectionTimeouts.set(connectionId, Date.now());

    console.log(
      `SSE connection established for user ${user.id} (${connectionId}). Total connections: ${userConnections.size}`
    );

    // Set up the response headers
    (c.res as http.ServerResponse).writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const updateActivity = () => {
      connectionTimeouts.set(connectionId, Date.now());
    };

    // Heartbeat to keep connection alive and track activity
    const keepAlive = setInterval(() => {
      if (!c.res.writable) {
        clearInterval(keepAlive);
        return;
      }
      updateActivity();
      // @ts-expect-error
      c.res.write(': ping\n\n');
    }, 30000);

    // @ts-expect-error
    c.res.write(':\n\n');
    // @ts-expect-error
    c.res.write(
      `data: ${JSON.stringify({
        type: 'CONNECTED',
        payload: {
          message: 'SSE connection established',
          timestamp: new Date().toISOString(),
          userId: user.id,
          connectionId: connectionId
        }
      })}\n\n`
    );

    updateActivity();

    const unsubscribe = chat.subscribeToEvents((event) => {
      if (!c.res.writable) {
        unsubscribe();
        return;
      }

      // Filter DM events: only send to participants
      const dmTypes = [
        'NEW_DM_MESSAGE',
        'UPDATE_DM_MESSAGE',
        'DELETE_DM_MESSAGE'
      ];
      if (dmTypes.includes(event.type)) {
        const payload = event.payload as { participants?: [string, string] };
        if (payload.participants && !payload.participants.includes(user.id))
          return;
      }

      try {
        updateActivity();
        // @ts-expect-error
        c.res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        console.error('Error sending SSE event:', error);
        cleanupConnection();
      }
    });

    const cleanupConnection = () => {
      const userConnections = activeConnections.get(user.id);
      if (userConnections) {
        userConnections.delete(connectionId);
        connectionTimeouts.delete(connectionId);
        console.log(
          `Connection ${connectionId} for user ${user.id} cleaned up. Remaining: ${userConnections.size}`
        );
        if (userConnections.size === 0) activeConnections.delete(user.id);
      }
      unsubscribe();
      clearInterval(keepAlive);
      if (c.res.writable) c.res.end();
    };

    // Handle connection close
    c.req.on('close', cleanupConnection);
    c.req.on('error', (error) => {
      console.error(`SSE connection error for user ${user.id}:`, error);
      cleanupConnection();
    });
    c.res.on('error', (error) => {
      console.error(`SSE response error for user ${user.id}:`, error);
      cleanupConnection();
    });

    return {
      statusCode: 200,
      _handled: true,
      body: null
    };
  });

  /**
   * @description Authentication middleware.
   */

  // biome-ignore lint/complexity/noBannedTypes: OK
  async function authenticate(c: Context, next: Function) {
    const unauthorized = {
      error: 'Unauthorized',
      message: 'Authentication required'
    };

    const authHeader = c.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return c.status(401).json(unauthorized);

    const token = authHeader.split(' ')[1];
    if (!token) return c.status(401).json(unauthorized);

    const payload = auth.verify(token);
    const user = await chat.getUserByEmail(payload.email || payload.sub);
    c.state.user = user;

    return next();
  }

  server.start();
}

/**
 * @description Save a client-generated thumbnail alongside the full image.
 */
function saveThumbnail(
  uploadDirectory: string,
  savedFileName: string,
  thumbnailBase64: string
) {
  try {
    const thumbBuffer = Buffer.from(thumbnailBase64, 'base64');
    const thumbPath = join(uploadDirectory, `thumb-${savedFileName}`);
    writeFileSync(thumbPath, thumbBuffer);
  } catch (error) {
    console.error('Failed to save thumbnail:', error);
  }
}

/**
 * @description Handle the deletion of images in a uniform manner.
 */
function deleteImages(images: string[]) {
  const uploadDirectory = `${process.cwd()}/uploads`;

  for (const image of images) {
    // Skip invalid filenames
    if (
      !image ||
      image.includes('..') ||
      image.includes('/') ||
      image.includes('\\')
    )
      continue;

    const imagePath = join(uploadDirectory, image);
    const thumbPath = join(uploadDirectory, `thumb-${image}`);

    // Verify path is within uploads directory
    if (!imagePath.startsWith(uploadDirectory)) continue;

    try {
      if (existsSync(imagePath)) unlinkSync(imagePath);
      if (existsSync(thumbPath)) unlinkSync(thumbPath);
    } catch (error) {
      console.error(`Failed to delete image ${image}:`, error);
    }
  }
}
