import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../core/errors.js';
import type { AuthUser, SessionStore, TokenService } from '../modules/auth/auth.types.js';

const BEARER_PREFIX = 'Bearer ';
const INVALID_SESSION = 'Tu sesión ya no es válida. Inicia sesión de nuevo.';

/**
 * Exige un JWT válido y que la sesión siga vigente en la BD:
 * - usuario inactivo o eliminado → 401 (el token deja de servir de inmediato);
 * - contraseña cambiada después de emitir el token → 401;
 * - el rol se toma de la BD, así que un cambio de rol aplica en la siguiente petición.
 */
export function createAuthenticate(tokens: TokenService, sessions: SessionStore): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedError('Se requiere iniciar sesión.');
    }

    const { user, passwordVersion } = tokens.verify(header.slice(BEARER_PREFIX.length).trim());
    const session = await sessions.findSessionState(user.id);
    if (session?.passwordVersion !== passwordVersion) {
      throw new UnauthorizedError(INVALID_SESSION);
    }

    req.user = { ...user, role: session.role };
    next();
  };
}

/** Obtiene el usuario autenticado; solo se usa en rutas protegidas por createAuthenticate. */
export function requireAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw new UnauthorizedError('Se requiere iniciar sesión.');
  }
  return req.user;
}
