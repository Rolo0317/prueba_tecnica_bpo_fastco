import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { UnauthorizedError } from '../../core/errors.js';
import type { AuthUser, IssuedToken, TokenService } from './auth.types.js';

const ALGORITHM = 'HS256';
const ISSUER = 'task-manager-api';
const AUDIENCE = 'task-manager-web';
const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3_600, d: 86_400 } as const;

const payloadSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  username: z.string(),
  name: z.string(),
});

/** Convierte "15m", "1h", "7d"… a segundos (el formato ya viene validado en env.ts). */
export function durationToSeconds(duration: string): number {
  const unit = duration.slice(-1) as keyof typeof SECONDS_PER_UNIT;
  return Number(duration.slice(0, -1)) * SECONDS_PER_UNIT[unit];
}

export class JwtTokenService implements TokenService {
  private readonly expiresInSeconds: number;

  constructor(private readonly config: Pick<AppConfig['auth'], 'jwtSecret' | 'jwtExpiresIn'>) {
    this.expiresInSeconds = durationToSeconds(config.jwtExpiresIn);
  }

  issue(user: AuthUser): IssuedToken {
    const token = jwt.sign({ username: user.username, name: user.fullName }, this.config.jwtSecret, {
      algorithm: ALGORITHM,
      subject: String(user.id),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: this.expiresInSeconds,
    });
    return { token, expiresIn: this.expiresInSeconds };
  }

  verify(token: string): AuthUser {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const payload = payloadSchema.parse(decoded);
      return { id: Number(payload.sub), username: payload.username, fullName: payload.name };
    } catch {
      throw new UnauthorizedError('La sesión no es válida o expiró. Inicia sesión de nuevo.');
    }
  }
}
