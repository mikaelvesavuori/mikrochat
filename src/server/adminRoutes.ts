import type { Context } from 'mikroserve';

import type { BaseRouteContext } from './types';

export function registerAdminRoutes({ server, authenticate, chat }: BaseRouteContext) {
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
      const message = error instanceof Error ? error.message : 'An error occurred';
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
      await chat.updateServerSettings({ name }, user.id);
      return c.json({ name }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

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
      const message = error instanceof Error ? error.message : 'An error occurred';
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
      const message = error instanceof Error ? error.message : 'An error occurred';
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
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Export server data for backups or migration. Admin only.
   */
  server.get('/admin/export', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    try {
      const data = await chat.exportData(user.id);
      return c.json(data, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });

  /**
   * @description Read recent administrative audit events. Admin only.
   */
  server.get('/admin/audit-log', authenticate, async (c: Context) => {
    const user = c.state.user;
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const parseQueryNumber = (value?: string) => {
      if (!value) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const limit = parseQueryNumber(c.query.limit);
    const offset = parseQueryNumber(c.query.offset);
    const from = parseQueryNumber(c.query.from);
    const to = parseQueryNumber(c.query.to);
    const action = c.query.action?.trim();
    const category = c.query.category?.trim();

    try {
      const auditLog = await chat.queryAuditLog(user.id, {
        action: action || undefined,
        category: category || undefined,
        from,
        limit,
        offset,
        to
      });
      return c.json(auditLog, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
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
        return c.json({ error: 'Webhook token does not match webhook ID' }, 403);

      const message = await chat.createWebhookMessage(content, webhook);
      return c.json({ message }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return c.json({ error: message }, 400);
    }
  });
}
