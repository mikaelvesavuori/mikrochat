import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { Context } from 'mikroserve';

import type { AuthRouteContext } from './types';

const MAX_CONNECTIONS_PER_USER = 3;
const CONNECTION_TIMEOUT_MS = 60 * 1000;

const activeConnections = new Map<string, Set<string>>();
const connectionTimeouts = new Map<string, number>();

type EventRouteContext = Pick<AuthRouteContext, 'server' | 'auth' | 'chat'>;

function getChannelIdFromEvent(event: { type: string; payload: any }) {
  if (event.type === 'NEW_CHANNEL' || event.type === 'UPDATE_CHANNEL') return event.payload.id;

  if (
    event.type === 'NEW_MESSAGE' ||
    event.type === 'UPDATE_MESSAGE' ||
    event.type === 'DELETE_MESSAGE' ||
    event.type === 'NEW_THREAD_REPLY' ||
    event.type === 'UPDATE_THREAD_REPLY' ||
    event.type === 'DELETE_THREAD_REPLY' ||
    event.type === 'NEW_WEBHOOK' ||
    event.type === 'DELETE_WEBHOOK'
  )
    return event.payload.channelId;

  return null;
}

export function registerEventRoutes({ server, auth, chat }: EventRouteContext) {
  /**
   * @description Set up connection with Server Sent Events.
   */
  server.get('/events', async (c: Context) => {
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

      userConnections?.forEach((connectionId: string) => {
        const lastActivity = connectionTimeouts.get(connectionId) || 0;
        if (now - lastActivity > CONNECTION_TIMEOUT_MS) staleConnectionIds.push(connectionId);
      });

      staleConnectionIds.forEach((connectionId) => {
        userConnections?.delete(connectionId);
        connectionTimeouts.delete(connectionId);
        console.log(`Cleaned up stale connection ${connectionId} for user ${user.id}`);
      });

      if (userConnections && userConnections.size >= MAX_CONNECTIONS_PER_USER) {
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
    userConnections?.add(connectionId);

    connectionTimeouts.set(connectionId, Date.now());
    await chat.setUserPresence(user.id, 'online');

    console.log(
      `SSE connection established for user ${user.id} (${connectionId}). Total connections: ${userConnections?.size || 0}`
    );

    const response = c.res as http.ServerResponse;

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const updateActivity = () => {
      connectionTimeouts.set(connectionId, Date.now());
    };

    const keepAlive = setInterval(() => {
      if (!response.writable) {
        clearInterval(keepAlive);
        return;
      }
      updateActivity();
      response.write(': ping\n\n');
    }, 30000);

    response.write(':\n\n');
    response.write(
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

    const unsubscribe = chat.subscribeToEvents(async (event) => {
      if (!response.writable) {
        unsubscribe();
        return;
      }

      const dmTypes = ['NEW_DM_MESSAGE', 'UPDATE_DM_MESSAGE', 'DELETE_DM_MESSAGE'];
      if (dmTypes.includes(event.type)) {
        const payload = event.payload as { participants?: [string, string] };
        if (payload.participants && !payload.participants.includes(user.id)) return;
      }

      if (event.type === 'DELETE_CHANNEL') {
        const payload = event.payload as {
          isPrivate?: boolean;
          members?: string[];
          createdBy?: string;
        };
        if (
          payload.isPrivate &&
          !user.isAdmin &&
          payload.createdBy !== user.id &&
          !payload.members?.includes(user.id)
        )
          return;
      }

      if (event.type === 'NEW_REACTION' || event.type === 'DELETE_REACTION') {
        const payload = event.payload as { messageId: string };
        const message = await chat.getMessageById(payload.messageId);
        if (!message) return;
        if (message.channelId.startsWith('dm:')) {
          const conversation = await chat.getConversationById(message.channelId);
          if (!conversation?.participants.includes(user.id)) return;
        } else {
          const canAccess = await chat.canUserAccessChannel(message.channelId, user.id);
          if (!canAccess) return;
        }
      }

      const channelId = getChannelIdFromEvent(event);
      if (channelId) {
        const canAccess = await chat.canUserAccessChannel(channelId, user.id);
        if (!canAccess) return;
      }

      try {
        updateActivity();
        response.write(`data: ${JSON.stringify(event)}\n\n`);
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
        if (userConnections.size === 0) {
          activeConnections.delete(user.id);
          chat.setUserPresence(user.id, 'offline').catch((error) => {
            console.error('Failed to update presence:', error);
          });
        }
      }
      unsubscribe();
      clearInterval(keepAlive);
      if (response.writable) response.end();
    };

    c.req.on('close', cleanupConnection);
    c.req.on('error', (error) => {
      console.error(`SSE connection error for user ${user.id}:`, error);
      cleanupConnection();
    });
    response.on('error', (error) => {
      console.error(`SSE response error for user ${user.id}:`, error);
      cleanupConnection();
    });

    return {
      statusCode: 200,
      _handled: true,
      body: null
    };
  });
}
