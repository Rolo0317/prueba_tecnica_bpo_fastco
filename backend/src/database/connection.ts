import sql from 'mssql';
import type { AppConfig } from '../config/env.js';

/** Crea y conecta el pool único de conexiones a SQL Server (usuario de mínimo privilegio). */
export async function createConnectionPool(
  config: AppConfig['database'],
): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
      appName: 'task-manager-api',
    },
    pool: { min: 0, max: 10, idleTimeoutMillis: 30_000 },
  });

  return pool.connect();
}
