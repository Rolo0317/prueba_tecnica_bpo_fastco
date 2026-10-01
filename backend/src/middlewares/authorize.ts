import type { RequestHandler } from 'express';
import { ForbiddenError } from '../core/errors.js';
import type { Role } from '../modules/users/user.types.js';
import { requireAuthUser } from './authenticate.js';

/** Restringe una ruta a ciertos roles. Va siempre después de createAuthenticate. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = requireAuthUser(req);
    next(roles.includes(user.role) ? undefined : new ForbiddenError());
  };
}
