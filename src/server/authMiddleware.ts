import type { Context } from 'mikroserve';

import type { ServerSettings } from '../interfaces';
import type { AuthMiddleware } from './types';

export function createAuthenticate({
  auth,
  chat
}: Pick<ServerSettings, 'auth' | 'chat'>): AuthMiddleware {
  return async function authenticate(c: Context, next) {
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
  };
}
