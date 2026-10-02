import type { RequestHandler } from 'express';
import { ForbiddenError } from '../core/errors.js';
import { can, type Permission } from '../modules/access/access.types.js';
import { requireAuthUser } from './authenticate.js';

/**
 * Exige al menos uno de los permisos indicados. Va siempre después de createAuthenticate,
 * que carga los permisos vigentes desde la BD en cada petición.
 */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    const user = requireAuthUser(req);
    next(
      permissions.some((permission) => can(user, permission)) ? undefined : new ForbiddenError(),
    );
  };
}
