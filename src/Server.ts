import { type Context, MikroServe } from 'mikroserve';

import type { Message, ServerSettings, User } from './interfaces';
import { deleteFiles, FileStorageError, serveFile, uploadFile } from './fileStorage';
import { deleteImages, ImageStorageError, serveImage, uploadImage } from './imageStorage';
import { MikroChat } from './MikroChat';

import { OAuthProvider } from './oauth/OAuthService';
import { OAuthSecurity } from './oauth/OAuthSecurity';
import { resolveOAuthProviders } from './oauth/OAuthProviderResolver';
import { registerAdminRoutes } from './server/adminRoutes';
import { createAuthenticate } from './server/authMiddleware';
import { registerEventRoutes } from './server/eventRoutes';
import { createPublicRuntimeConfig } from './server/publicConfig';

const DEFAULT_PAGE_LIMIT = 50;
const MAGIC_LINK_EMAIL_TIMEOUT_MS = 10_000;
const MAGIC_LINK_RESPONSE = 'If this email can sign in, you will receive a link shortly.';

/**
 * @description Runs a MikroServe instance to expose MikroChat as an API.
 */
export async function startServer(settings: ServerSettings) {
  const { config, auth, chat, isInviteRequired, hasEmailConfig, authMode, appUrl } = settings;
  const { oauth } = settings;
  const publicRuntimeConfig = createPublicRuntimeConfig({
    authMode,
    hasEmailConfig,
    isInviteRequired,
    oauth
  });

  const server = new MikroServe(config);
  const authenticate = createAuthenticate({ auth, chat });

  async function createMagicLinkWithTimeout(
    request: Parameters<typeof auth.createMagicLink>[0]
  ): Promise<Awaited<ReturnType<typeof auth.createMagicLink>>> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        auth.createMagicLink(request),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Magic link email timed out')),
            MAGIC_LINK_EMAIL_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  server.get('/health', async (c: Context) => c.text('OK', 200));
  server.get('/config.json', async (c: Context) => c.json(publicRuntimeConfig, 200));
  server.get('/auth/config', async (c: Context) => c.json(publicRuntimeConfig, 200));

  async function enrichMessagesWithAuthors(messages: Message[]): Promise<Message[]> {
    const uniqueAuthorIds = [
      ...new Set(messages.filter((m) => !m.author.isBot).map((m) => m.author.id))
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

  function uploadImageResponse(c: Context) {
    try {
      const filename = uploadImage(c.body);
      return c.json({ success: true, filename });
    } catch (error) {
      if (error instanceof ImageStorageError) return c.json({ error: error.message }, error.status);

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

  function imageFetchResponse(c: Context) {
    try {
      const storedImage = serveImage(c.params.filename, c.query.size === 'thumb');
      return c.binary(storedImage.buffer, storedImage.contentType);
    } catch (error) {
      if (error instanceof ImageStorageError) return c.json({ error: error.message }, error.status);

      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Image fetch failed'
        },
        500
      );
    }
  }

  function uploadFileResponse(c: Context) {
    try {
      const attachment = uploadFile(c.body);
      return c.json({ success: true, attachment }, 200);
    } catch (error) {
      if (error instanceof FileStorageError) return c.json({ error: error.message }, error.status);

      console.error('File upload error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed'
        },
        500
      );
    }
  }

  async function fileFetchResponse(c: Context, userId: string) {
    try {
      const attachment = await chat.getAttachmentForUser(c.params.filename, userId);
      if (!attachment) return c.json({ error: 'File not found' }, 404);

      const storedFile = serveFile(attachment);
      c.res?.setHeader?.(
        'Content-Disposition',
        `attachment; filename="${storedFile.originalName}"`
      );
      return c.binary(storedFile.buffer, storedFile.contentType);
    } catch (error) {
      if (error instanceof FileStorageError) return c.json({ error: error.message }, error.status);

      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'File fetch failed'
        },
        500
      );
    }
  }

  /////////////////////////////////////
  // Development Mode Authentication //
  /////////////////////////////////////

  if (authMode === 'dev') {
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

  if (authMode === 'magic-link') {
    /**
     * @description Sign in (log in) user. This uses a magic link email
     * to authenticate the user so a successful response here simply
     * means that the email was sent.
     */
    server.post('/auth/login', async (c: Context) => {
      if (!c.body.email) return c.json({ error: 'Email is required' }, 400);
      const { email } = c.body;

      async function createLink() {
        try {
          await createMagicLinkWithTimeout({ email });
        } catch (error) {
          console.error('Failed to request magic link:', error);
        }
      }

      if (isInviteRequired) {
        const user = await chat.getUserByEmail(email);
        if (user) await createLink();
      } else await createLink();

      return c.json(
        {
          success: true,
          message: MAGIC_LINK_RESPONSE
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

  if (authMode === 'password') {
    /**
     * @description Sign in with email and password.
     */
    server.post('/auth/password-login', async (c: Context) => {
      const { email, password } = c.body;
      if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

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
     * @description Request a password reset email.
     * Always returns success to prevent email enumeration.
     * Only sends the email if the user exists and has a password set.
     */
    server.post('/auth/request-password-reset', async (c: Context) => {
      const { email } = c.body;
      if (!email) return c.json({ error: 'Email is required' }, 400);

      try {
        const user = await chat.getUserByEmail(email);
        if (user)
          await createMagicLinkWithTimeout({
            email,
            appUrl: user.passwordHash ? `${appUrl.replace(/\/$/, '')}/reset` : appUrl,
            subject: user.passwordHash ? 'Reset Your Password' : 'Set Your Password'
          });
      } catch {
        // Silently ignore errors to prevent email enumeration
      }

      return c.json(
        {
          success: true,
          message: 'If this email can reset a password, you will receive a link shortly.'
        },
        200
      );
    });

    /**
     * @description Set password for an invited user via a magic link token.
     * The invite email uses the same magic link mechanism; the frontend
     * shows a "set password" form instead of auto-verifying.
     * Also used for password reset — the same token mechanism applies.
     */
    server.post('/auth/setup-password', async (c: Context) => {
      const { email, password, token: bodyToken } = c.body;
      const authHeader = c.headers.authorization || '';
      const token = bodyToken || authHeader.split(' ')[1];

      if (!email || !token) return c.json({ error: 'Email and token are required' }, 400);
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
          return c.json({ error: 'Password must be at least 8 characters' }, 400);

        try {
          const existingUser = await chat.getUserByEmail(email);
          if (existingUser) return c.json({ error: 'User already exists' }, 400);

          const user = await chat.addUser(email, email, false, true);
          await chat.setUserPassword(user.id, password);

          const tokens = await auth.createToken({
            email: user.email,
            username: user.userName,
            role: 'user'
          });
          return c.json(tokens, 200);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'An error occurred';
          return c.json({ error: message }, 400);
        }
      });
    }
  }

  //////////////////
  // OAuth Auth   //
  //////////////////

  if (oauth) {
    const oauthSecurity = new OAuthSecurity(oauth);
    const oauthProviders = new Map<string, OAuthProvider>();

    const providerConfigs = resolveOAuthProviders(oauth);
    for (const providerConfig of providerConfigs) {
      const provider = new OAuthProvider(providerConfig, auth);
      oauthProviders.set(providerConfig.id, provider);
    }

    if (oauthProviders.size > 0) {
      /**
       * @description List available OAuth providers.
       */
      server.get('/auth/oauth/providers', async (c: Context) => {
        const providerList = Array.from(oauthProviders.values()).map((provider) =>
          provider.getPublicInfo()
        );
        return c.json({ providers: providerList, count: providerList.length });
      });

      for (const [providerId, provider] of oauthProviders.entries()) {
        /**
         * @description Initiate OAuth flow for a specific provider.
         * Generates CSRF state and redirects the user to the OAuth provider.
         */
        server.get(`/auth/oauth/${providerId}`, async (c: Context) => {
          try {
            const forwardedFor = c.headers['x-forwarded-for'];
            const realIp = c.headers['x-real-ip'];
            const ip =
              (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
                ?.split(',')[0]
                ?.trim() ||
              (Array.isArray(realIp) ? realIp[0] : realIp) ||
              'unknown';

            if (!oauthSecurity.checkRateLimit(`oauth:${ip}`)) {
              const info = oauthSecurity.getRateLimitInfo(`oauth:${ip}`);
              return c.json(
                {
                  error: 'Too many authentication attempts. Please try again later.',
                  retryAfter: Math.ceil((info.reset - Date.now()) / 1000)
                },
                429
              );
            }

            const state = oauthSecurity.generateState(ip, providerId);
            const authUrl = provider.getAuthorizationUrl(state);
            return c.redirect(authUrl, 302);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Error initiating OAuth flow';
            return c.json({ error: message }, 500);
          }
        });

        /**
         * @description Handle OAuth callback for a specific provider.
         * Validates CSRF state, exchanges code for tokens, and issues JWT.
         */
        server.get(`/auth/oauth/${providerId}/callback`, async (c: Context) => {
          try {
            const forwardedFor = c.headers['x-forwarded-for'];
            const realIp = c.headers['x-real-ip'];
            const ip =
              (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
                ?.split(',')[0]
                ?.trim() ||
              (Array.isArray(realIp) ? realIp[0] : realIp) ||
              'unknown';

            if (!oauthSecurity.checkRateLimit(`oauth:${ip}`)) {
              const info = oauthSecurity.getRateLimitInfo(`oauth:${ip}`);
              return c.json(
                {
                  error: 'Too many authentication attempts. Please try again later.',
                  retryAfter: Math.ceil((info.reset - Date.now()) / 1000)
                },
                429
              );
            }

            // Check for OAuth error response
            const error = c.query.error;
            if (error) {
              const description = c.query.error_description || 'Authentication was denied';
              return c.redirect(`${appUrl}/?oauth_error=${encodeURIComponent(description)}`, 302);
            }

            // Validate CSRF state
            const state = c.query.state;
            const code = c.query.code;
            if (!state || !code)
              return c.redirect(
                `${appUrl}/?oauth_error=${encodeURIComponent('Missing state or authorization code')}`,
                302
              );

            const validation = oauthSecurity.validateState(state as string, ip, providerId);
            if (!validation.valid)
              return c.redirect(
                `${appUrl}/?oauth_error=${encodeURIComponent(validation.error || 'Invalid OAuth callback')}`,
                302
              );

            // Exchange code for tokens and fetch user info
            const result = await provider.handleCallback(code as string, ip);

            // Find or create user
            let user = await chat.getUserByEmail(result.user.email);

            if (!user && isInviteRequired) {
              return c.redirect(
                `${appUrl}/?oauth_error=${encodeURIComponent('User not found. You must be invited before signing in with OAuth.')}`,
                302
              );
            }

            if (!user) {
              user = await chat.addUser(
                result.user.email,
                result.user.name || result.user.username || result.user.email,
                false,
                true
              );
            }

            const oauthParams = new URLSearchParams({
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
              expires_in: String(result.expiresIn)
            });
            return c.redirect(`${appUrl}/?${oauthParams.toString()}`, 302);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'OAuth authentication failed';
            return c.redirect(`${appUrl}/?oauth_error=${encodeURIComponent(message)}`, 302);
          }
        });
      }
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
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json(null, 401);

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
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json(null, 401);

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

    const { email, role, password } = c.body;
    if (!email) return c.json({ error: 'Email is required' }, 400);
    if (!user.isAdmin) return c.json({ error: 'Only administrators can add users' }, 403);

    try {
      // Ensure only admins can create admin users
      if (role === 'admin' && !user.isAdmin)
        return c.json({ error: 'Only administrators can add admin users' }, 403);

      const existingUser = await chat.getUserByEmail(email);
      if (existingUser) return c.json({ success: false, message: 'User already exists' });

      const newUser = await chat.addUser(email, user.id, role === 'admin');

      if (authMode === 'password' && password) {
        await chat.setUserPassword(newUser.id, password);
      } else if (authMode === 'password' && hasEmailConfig) {
        try {
          await createMagicLinkWithTimeout({ email });
        } catch {
          // Email sending failed, but user was created
        }
      }

      return c.json({ success: true, userId: newUser.id }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
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
      const message = error instanceof Error ? error.message : 'An error occurred';
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

    if (userId === user.id) return c.json({ error: 'You cannot remove your own account' }, 400);

    try {
      await chat.removeUser(userId, user.id);
      return c.json({ success: true }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Admin-only: update a user's role.
   */
  server.put('/users/:id/role', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (!user.isAdmin) return c.json({ error: 'Only administrators can update user roles' }, 403);

    const userId = c.params.id;
    const requestedRole = c.body?.role;
    const requestedAdminStatus = c.body?.isAdmin;

    const isAdmin =
      typeof requestedAdminStatus === 'boolean'
        ? requestedAdminStatus
        : requestedRole === 'admin'
          ? true
          : requestedRole === 'user'
            ? false
            : null;

    if (typeof isAdmin !== 'boolean')
      return c.json({ error: 'Role must be "user" or "admin"' }, 400);

    try {
      const updatedUser = await chat.updateUserRole(userId, user.id, isAdmin);
      return c.json({ user: MikroChat.sanitizeUser(updatedUser) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Admin-only: reset a user's password directly.
   */
  server.post('/users/:id/reset-password', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (!user.isAdmin) return c.json({ error: 'Only administrators can reset passwords' }, 403);

    const userId = c.params.id;
    const { password } = c.body;

    if (!password || password.length < 8)
      return c.json({ error: 'Password must be at least 8 characters' }, 400);

    try {
      await chat.setUserPassword(userId, password);
      return c.json({ success: true }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
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
          return c.json({ error: 'Cannot exit as the last administrator' }, 400);
        }
      }

      await chat.exitUser(user.id);

      return c.json({ success: true, message: 'You have exited the server' }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Update the current user's profile (display name).
   */
  server.put('/users/me', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const { userName } = c.body;
      if (!userName || typeof userName !== 'string')
        return c.json({ error: 'userName is required' }, 400);

      const updatedUser = await chat.updateUserName(user.id, userName);
      return c.json({ user: MikroChat.sanitizeUser(updatedUser) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Read current user presence states.
   */
  server.get('/presence', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    return c.json({ presence: chat.getPresence() }, 200);
  });

  /**
   * @description Update the current user's presence status.
   */
  server.put('/presence/me', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const status = c.body?.status;
    if (!['online', 'away', 'offline'].includes(status))
      return c.json({ error: 'Invalid presence status' }, 400);

    try {
      const presence = await chat.setUserPresence(user.id, status);
      return c.json({ presence }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
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

    const channels = await chat.listChannelsForUser(user.id);
    return c.json({ channels }, 200);
  });

  /**
   * @description Create a new channel on the server.
   */
  server.post('/channels', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { name, topic, isPrivate, members } = c.body;
    if (!name) return c.json({ error: 'Channel name is required' }, 400);

    try {
      const channel = await chat.createChannel(name, user.id, {
        topic,
        isPrivate,
        members
      });
      return c.json({ channel }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Get all messages in a channel.
   */
  server.get('/channels/:channelId/messages', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channelId = c.params.channelId;
    const limit = c.query.limit ? parseInt(c.query.limit, 10) : DEFAULT_PAGE_LIMIT;
    const before = c.query.before || undefined;

    try {
      const messages = await chat.getMessagesByChannel(
        channelId,
        {
          limit,
          before
        },
        user.id
      );
      const enhancedMessages = await enrichMessagesWithAuthors(messages);

      return c.json({ messages: enhancedMessages }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Create a message in a specific channel.
   */
  server.post('/channels/:channelId/messages', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channelId = c.params.channelId;
    const content = c.body?.content;
    const images = c.body?.images;
    const attachments = c.body?.attachments;
    const quotedMessageId = c.body?.quotedMessageId;

    if (!content && !images && !attachments)
      return c.json({ error: 'Message content is required' }, 400);

    try {
      const message = await chat.createMessage(content || '', user.id, channelId, {
        images: images || [],
        attachments: attachments || [],
        quotedMessageId
      });

      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Update the information for a channel.
   */
  server.put('/channels/:channelId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channelId = c.params.channelId;
    const { name, topic, isPrivate, members } = c.body;

    if (
      name === undefined &&
      topic === undefined &&
      isPrivate === undefined &&
      members === undefined
    )
      return c.json({ error: 'No channel update data provided' }, 400);

    try {
      const channel = await chat.updateChannel(
        channelId,
        { name, topic, isPrivate, members },
        user.id
      );

      return c.json({ channel }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
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
      const message = error instanceof Error ? error.message : 'An error occurred';
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
    const attachments = c.body?.attachments;
    const quotedMessageId = c.body?.quotedMessageId;

    if (!content && !images && !attachments && quotedMessageId === undefined)
      return c.json({ error: 'Message content is required' }, 400);

    try {
      const { message, removedImages, removedAttachments } = await chat.updateMessage(
        messageId,
        user.id,
        content,
        {
          images,
          attachments,
          quotedMessageId
        }
      );

      deleteImages(removedImages);
      deleteFiles(removedAttachments);

      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Pin a message in its channel.
   */
  server.post('/messages/:messageId/pin', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;

    try {
      const message = await chat.pinMessage(messageId, user.id);
      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Remove a channel pin from a message.
   */
  server.delete('/messages/:messageId/pin', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;

    try {
      const message = await chat.unpinMessage(messageId, user.id);
      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description List pinned messages in a channel.
   */
  server.get('/channels/:channelId/pins', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const channelId = c.params.channelId;

    try {
      const messages = await chat.listPinnedMessages(channelId, user.id);
      const enhancedMessages = await enrichMessagesWithAuthors(messages);
      return c.json({ messages: enhancedMessages }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Search messages visible to the current user.
   */
  server.get('/search/messages', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const q = c.query.q || '';
    const limit = c.query.limit ? parseInt(c.query.limit, 10) : 50;
    const from = c.query.from ? Number.parseInt(c.query.from, 10) : undefined;
    const to = c.query.to ? Number.parseInt(c.query.to, 10) : undefined;

    try {
      const messages = await chat.searchMessages(user.id, q, {
        channelId: c.query.channelId,
        conversationId: c.query.conversationId,
        authorId: c.query.authorId,
        from,
        to,
        limit
      });
      const enhancedMessages = await enrichMessagesWithAuthors(messages);
      return c.json({ messages: enhancedMessages }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Upload a generic file attachment.
   */
  server.post('/files', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    return uploadFileResponse(c);
  });

  /**
   * @description Download a generic file attachment.
   */
  server.get('/files/:filename', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    return fileFetchResponse(c, user.id);
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
      const attachments = message?.attachments || [];

      await chat.deleteMessage(messageId, user.id);

      deleteImages(images);
      deleteFiles(attachments);

      return c.json({ success: true }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Add a reaction to a message.
   */
  server.post('/messages/:messageId/reactions', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;
    const { reaction } = c.body;

    if (!reaction) return c.json({ error: 'Reaction is required' }, 400);

    try {
      const message = await chat.addReaction(messageId, user.id, reaction);

      if (!message) {
        return c.json({ error: `Message with ID ${messageId} not found` }, 404);
      }

      return c.json({ message }, 200);
    } catch (error) {
      console.error(`Error adding reaction to message ${messageId}:`, error);
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Remove a reaction from a message.
   */
  server.delete('/messages/:messageId/reactions', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;
    const { reaction } = c.body;

    if (!reaction) return c.json({ error: 'Reaction is required' }, 400);

    try {
      const message = await chat.removeReaction(messageId, user.id, reaction);

      if (!message) {
        return c.json({ error: `Message with ID ${messageId} not found` }, 404);
      }

      return c.json({ message }, 200);
    } catch (error) {
      console.error(`Error removing reaction from message ${messageId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: errorMessage }, 400);
    }
  });

  /////////////
  // Threads //
  /////////////

  /**
   * @description Get all replies in a thread.
   */
  server.get('/messages/:messageId/thread', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const messageId = c.params.messageId;
    const limit = c.query.limit ? parseInt(c.query.limit, 10) : DEFAULT_PAGE_LIMIT;
    const before = c.query.before || undefined;

    try {
      const replies = await chat.getThreadReplies(
        messageId,
        {
          limit,
          before
        },
        user.id
      );
      const enhancedReplies = await enrichMessagesWithAuthors(replies);

      return c.json({ replies: enhancedReplies }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Create a thread reply on a message.
   */
  server.post('/messages/:messageId/thread', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const parentMessageId = c.params.messageId;
    const content = c.body?.content;
    const images = c.body?.images;
    const attachments = c.body?.attachments;
    const quotedMessageId = c.body?.quotedMessageId;

    if (!content && !images && !attachments)
      return c.json({ error: 'Message content is required' }, 400);

    try {
      const { reply, parentMessage } = await chat.createThreadReply(
        content || '',
        user.id,
        parentMessageId,
        {
          images: images || [],
          attachments: attachments || [],
          quotedMessageId
        }
      );

      return c.json({ reply, threadMeta: parentMessage.threadMeta }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Update a thread reply.
   */
  server.put('/messages/:messageId/thread/:replyId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const replyId = c.params.replyId;
    const content = c.body?.content;
    const images = c.body?.images;
    const attachments = c.body?.attachments;
    const quotedMessageId = c.body?.quotedMessageId;

    if (!content && !images && !attachments && quotedMessageId === undefined)
      return c.json({ error: 'Message content is required' }, 400);

    try {
      const { message, removedImages, removedAttachments } = await chat.updateThreadReply(
        replyId,
        user.id,
        content,
        {
          images,
          attachments,
          quotedMessageId
        }
      );

      deleteImages(removedImages);
      deleteFiles(removedAttachments);

      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Delete a thread reply.
   */
  server.delete('/messages/:messageId/thread/:replyId', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const replyId = c.params.replyId;

    try {
      const reply = await chat.getMessageById(replyId);
      const images = reply?.images || [];
      const attachments = reply?.attachments || [];

      await chat.deleteThreadReply(replyId, user.id);

      deleteImages(images);
      deleteFiles(attachments);

      return c.json({ success: true }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Upload an image for a thread reply.
   */
  server.post('/messages/:messageId/thread/image', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const parentMessage = await chat.getMessageById(c.params.messageId);
    if (!parentMessage) return c.json({ error: 'Parent message not found' }, 404);

    if (parentMessage.channelId.startsWith('dm:')) {
      const conversation = await chat.getConversationById(parentMessage.channelId);
      if (!conversation?.participants.includes(user.id))
        return c.json({ error: 'You are not a participant in this conversation' }, 403);
    } else {
      const canAccess = await chat.canUserAccessChannel(parentMessage.channelId, user.id);
      if (!canAccess) return c.json({ error: 'You do not have access to this channel' }, 403);
    }

    return uploadImageResponse(c);
  });

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
          conversations.map((conv) => conv.participants.find((p) => p !== user.id)).filter(Boolean)
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
          otherUser: otherUser ? { id: otherUser.id, userName: otherUser.userName } : null
        };
      });

      return c.json({ conversations: enhancedConversations }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
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
    if (!targetUserId) return c.json({ error: 'Target user ID is required' }, 400);

    try {
      const { conversation, isNew } = await chat.getOrCreateConversation(user.id, targetUserId);

      // Get other user info
      const otherUser = await chat.getUserById(targetUserId);

      return c.json(
        {
          conversation: {
            ...conversation,
            otherUser: otherUser ? { id: otherUser.id, userName: otherUser.userName } : null
          },
          isNew
        },
        200
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Get all messages in a conversation.
   */
  server.get('/conversations/:conversationId/messages', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const conversationId = c.params.conversationId;

    try {
      const conversation = await chat.getConversationById(conversationId);
      if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

      if (!conversation.participants.includes(user.id))
        return c.json({ error: 'You are not a participant in this conversation' }, 403);

      const limit = c.query.limit ? parseInt(c.query.limit, 10) : DEFAULT_PAGE_LIMIT;
      const before = c.query.before || undefined;
      const messages = await chat.getMessagesByConversation(conversationId, {
        limit,
        before
      });
      const enhancedMessages = await enrichMessagesWithAuthors(messages);

      return c.json({ messages: enhancedMessages }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Send a direct message in a conversation.
   */
  server.post('/conversations/:conversationId/messages', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const conversationId = c.params.conversationId;
    const content = c.body?.content;
    const images = c.body?.images;
    const attachments = c.body?.attachments;
    const quotedMessageId = c.body?.quotedMessageId;

    if (!content && !images && !attachments)
      return c.json({ error: 'Message content is required' }, 400);

    try {
      const message = await chat.createDirectMessage(content || '', user.id, conversationId, {
        images: images || [],
        attachments: attachments || [],
        quotedMessageId
      });

      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

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
      const attachments = c.body?.attachments;
      const quotedMessageId = c.body?.quotedMessageId;

      if (!content && !images && !attachments && quotedMessageId === undefined)
        return c.json({ error: 'Message content is required' }, 400);

      try {
        const { message, removedImages, removedAttachments } = await chat.updateDirectMessage(
          messageId,
          user.id,
          content,
          {
            images,
            attachments,
            quotedMessageId
          }
        );

        deleteImages(removedImages);
        deleteFiles(removedAttachments);

        return c.json({ message }, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'An error occurred';
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
        const attachments = message?.attachments || [];

        await chat.deleteDirectMessage(messageId, user.id);

        deleteImages(images);
        deleteFiles(attachments);

        return c.json({ success: true }, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'An error occurred';
        return c.json({ error: message }, 400);
      }
    }
  );

  /**
   * @description Upload an image for a direct message.
   */
  server.post('/conversations/:conversationId/messages/image', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const conversationId = c.params.conversationId;

    try {
      // Verify user is participant in conversation
      const conversation = await chat.getConversationById(conversationId);
      if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

      if (!conversation.participants.includes(user.id))
        return c.json({ error: 'You are not a participant in this conversation' }, 403);

      return uploadImageResponse(c);
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Image upload failed'
        },
        500
      );
    }
  });

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
        if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

        if (!conversation.participants.includes(user.id))
          return c.json({ error: 'You are not a participant in this conversation' }, 403);

        return imageFetchResponse(c);
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
  server.post('/channels/:channelId/messages/image', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const canAccess = await chat.canUserAccessChannel(c.params.channelId, user.id);
    if (!canAccess) return c.json({ error: 'You do not have access to this channel' }, 403);

    return uploadImageResponse(c);
  });

  /**
   * @description Get an image by file name, as the stored file is named on the server.
   */
  server.get('/channels/:channelId/messages/image/:filename', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const canAccess = await chat.canUserAccessChannel(c.params.channelId, user.id);
    if (!canAccess) return c.json({ error: 'You do not have access to this channel' }, 403);

    return imageFetchResponse(c);
  });

  registerAdminRoutes({ server, authenticate, chat });

  registerEventRoutes({ server, auth, chat });

  server.start();
}
