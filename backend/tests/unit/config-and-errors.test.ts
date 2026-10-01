import sql from 'mssql';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/core/errors.js';
import { translateSqlError } from '../../src/database/sql-errors.js';

const VALID_ENV = {
  CORS_ORIGINS: 'http://localhost:8080, https://app.example.com',
  DB_HOST: 'db',
  DB_NAME: 'TaskManager',
  DB_APP_USER: 'task_app',
  DB_APP_PASSWORD: 'secret',
  JWT_SECRET: 'x'.repeat(32),
  SEED_ADMIN_USERNAME: 'admin',
  SEED_ADMIN_PASSWORD: 'Admin12345!',
  SEED_ADMIN_FULL_NAME: 'Admin',
};

describe('loadConfig', () => {
  it('construye la configuración tipada y aplica valores por defecto', () => {
    const config = loadConfig(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.corsOrigins).toEqual(['http://localhost:8080', 'https://app.example.com']);
    expect(config.database.encrypt).toBe(true);
    expect(config.auth.jwtExpiresIn).toBe('1h');
  });

  it('falla si falta un secreto o es demasiado corto, sin exponer su valor', () => {
    const attempt = () => loadConfig({ ...VALID_ENV, JWT_SECRET: 'corto' });

    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/JWT_SECRET/);
    expect(attempt).not.toThrow(/corto/);
  });

  it('falla si falta una variable obligatoria', () => {
    const { DB_HOST: _omitted, ...withoutHost } = VALID_ENV;

    expect(() => loadConfig(withoutHost)).toThrow(/DB_HOST/);
  });
});

describe('translateSqlError', () => {
  const sqlError = (number: number, message: string) =>
    Object.assign(new sql.RequestError(message), { number });

  it.each([
    [50400, ValidationError, 400],
    [50404, NotFoundError, 404],
    [50409, ConflictError, 409],
  ])('traduce THROW %i del SP a %s (HTTP %i)', (number, ErrorType, status) => {
    const translated = translateSqlError(sqlError(number, 'Mensaje de negocio'));

    expect(translated).toBeInstanceOf(ErrorType);
    expect(translated).toMatchObject({ statusCode: status, message: 'Mensaje de negocio' });
  });

  it('deja intactos los errores técnicos de SQL Server (se responden como 500)', () => {
    const technical = sqlError(2627, 'Violation of UNIQUE KEY constraint');

    expect(translateSqlError(technical)).toBe(technical);
  });
});
