import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError, NotFoundError, ValidationError } from '../core/errors.js';

interface BodyParserError {
  type: string;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string';

/** Normaliza cualquier error a un AppError con un mensaje seguro para el cliente. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new ValidationError('El cuerpo de la petición no es un JSON válido.');
    }
    if (error.type === 'entity.too.large') {
      return new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        'El cuerpo de la petición es demasiado grande.',
      );
    }
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado. Intenta de nuevo.');
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const appError = toAppError(error);

    if (appError.statusCode >= 500) {
      // El detalle técnico solo va al log; el cliente recibe un mensaje genérico.
      logger.error({ err: error, method: req.method, path: req.path }, 'Error no controlado');
    }

    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details && { details: appError.details }),
      },
    });
  };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`La ruta ${req.method} ${req.path} no existe.`));
};
