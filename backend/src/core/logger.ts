import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config/env.js';

/** Rutas que nunca deben aparecer en los logs (credenciales y tokens). */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'token',
  '*.token',
];

export function createLogger(config: Pick<AppConfig, 'env' | 'logLevel'>): Logger {
  return pino({
    level: config.env === 'test' ? 'silent' : config.logLevel,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    ...(config.env === 'development' && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  });
}
