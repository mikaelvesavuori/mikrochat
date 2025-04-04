import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { type Context, MikroServe } from 'mikroserve';

import type { ServerSettings, User } from './interfaces';

const MAX_IMAGE_SIZE_IN_MB = 2;
const VALID_FILE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'svg'];

const MAX_CONNECTIONS_PER_USER = 3;
const CONNECTION_TIMEOUT_MS = 60 * 1000;

const activeConnections = new Map();
const connectionTimeouts = new Map();

/**
 * @description Runs a MikroServe instance to expose MikroChat as an API.
 */
export async function startServer(settings: ServerSettings) {
  const { config, auth, chat, devMode, isInviteRequired } = settings;

  const server = new MikroServe(config);

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

      let user: any;
      user = await chat.getUserByEmail(email);

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

  /**
   * @description Sign in (log in) user. This uses a magic link email
   * to authenticate the user so a successful response here simply
   * means that the email was sent.
   *
   * If an invite is required to join the server, then only existing
   * users will receive the magic link. Whether or not they exist is
   * never explicitly expressed to the caller.
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

      if (!result) return c.json({ error: 'Failed to create magic link' }, 400);

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
    return c.json({ user: c.state.user }, 200);
  });

  /**
   * @description Verify a magic link.
   */
  server.post('/auth/verify', async (c: Context) => {
    const body = c.body;
    const authHeader = c.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) return c.json({ error: 'Token is required' }, 400);

    let result: any;

    try {
      result = await auth.verifyToken({
        email: body.email,
        token: token
      });
      if (!result) return c.json({ error: 'Invalid token' }, 400);
    } catch (error) {
      return c.json({ error: 'Invalid token' }, 400);
    }

    return c.json(result, 200);
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
      return c.json({ success: true, userId }, 200);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
      return c.json({ users }, 200);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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

      try {
        const messages = await chat.getMessagesByChannel(channelId);

        const enhancedMessages = await Promise.all(
          messages.map(async (message) => {
            const author = await chat.getUserById(message.author.id);
            return {
              ...message,
              author: {
                id: author?.id,
                userName: author?.userName || 'Unknown User'
              }
            };
          })
        );

        return c.json({ messages: enhancedMessages }, 200);
      } catch (error: any) {
        return c.json({ error: error.message }, 400);
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
      } catch (error: any) {
        return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
            401
          );
        }

        return c.json({ message }, 200);
      } catch (error: any) {
        console.error(`Error adding reaction to message ${messageId}:`, error);
        return c.json({ error: error.message }, 400);
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
      } catch (error: any) {
        console.error(
          `Error removing reaction from message ${messageId}:`,
          error
        );
        return c.json({ error: error.message }, 400);
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
        const { filename, image } = c.body;

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

        const savedFileName = `${Date.now()}-${randomBytes(1).toString('hex')}.${fileExtension}`;
        const uploadPath = join(uploadDirectory, savedFileName);

        writeFileSync(uploadPath, imageBuffer);

        return c.json({
          success: true,
          //channelId,
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

        const uploadDirectory = `${process.cwd()}/uploads`;
        const filePath = join(uploadDirectory, filename);

        if (!existsSync(filePath))
          return c.json({ error: 'Image not found' }, 404);

        const imageBuffer = readFileSync(filePath);

        const fileExtension = filename.split('.').pop()?.toLowerCase();
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
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
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  });

  //////////////////////////////
  // Server Sent Events (SSE) //
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
    c.res.writeHead(200, {
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
      // @ts-ignore
      c.res.write(': ping\n\n');
    }, 30000);

    // @ts-ignore
    c.res.write(':\n\n');
    // @ts-ignore
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
      try {
        updateActivity();
        // @ts-ignore
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
 * @description Handle the deletion of images in a uniform manner.
 */
function deleteImages(images: string[]) {
  for (const image of images) {
    const uploadDirectory = `${process.cwd()}/uploads`;
    const imagePath = join(uploadDirectory, image);
    unlinkSync(imagePath);
  }
}
