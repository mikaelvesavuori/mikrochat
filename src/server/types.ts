import type { Middleware, MikroServe } from 'mikroserve';

import type { ServerSettings } from '../interfaces';

export type AuthMiddleware = Middleware;

export type BaseRouteContext = {
  server: MikroServe;
  authenticate: AuthMiddleware;
  chat: ServerSettings['chat'];
};

export type AuthRouteContext = BaseRouteContext & {
  auth: ServerSettings['auth'];
};
