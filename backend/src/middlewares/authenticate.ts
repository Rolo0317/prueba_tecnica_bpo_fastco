import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../core/errors.js';
import type { AuthUser, TokenService } from '../modules/auth/auth.types.js';

const BEARER_PREFIX = 'Bearer ';

/** Exige un JWT válido en el header Authorization y adjunta el usuario a la petición. */
export function createAuthenticate(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;

    if (!header?.startsWith(BEARER_PREFIX)) {
      next(new UnauthorizedError('Se requiere iniciar sesión.'));
      return;
    }

    req.user = tokens.verify(header.slice(BEARER_PREFIX.length).trim());
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
