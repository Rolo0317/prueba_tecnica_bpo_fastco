import sql from 'mssql';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type AppError,
} from '../core/errors.js';

/**
 * Códigos THROW de los Stored Procedures (ver db/scripts/05_procedures.sql).
 * Sus mensajes están escritos para el usuario final, así que se pueden exponer.
 */
const BUSINESS_ERRORS: Readonly<Record<number, (message: string) => AppError>> = {
  50400: (message) => new ValidationError(message),
  50403: (message) => new ForbiddenError(message),
  50404: (message) => new NotFoundError(message),
  50409: (message) => new ConflictError(message),
};

/** Convierte un error de negocio de SQL Server en un AppError; cualquier otro se devuelve intacto. */
export function translateSqlError(error: unknown): unknown {
  if (!(error instanceof sql.RequestError) || error.number === undefined) {
    return error;
  }

  const toAppError = BUSINESS_ERRORS[error.number];
  return toAppError ? toAppError(error.message) : error;
}
