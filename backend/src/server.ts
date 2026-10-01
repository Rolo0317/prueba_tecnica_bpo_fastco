import type { Server } from 'node:http';
import type sql from 'mssql';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createContainer } from './container.js';
import { createLogger } from './core/logger.js';
import { createConnectionPool } from './database/connection.js';
import { ProcedureExecutor } from './database/procedure-executor.js';
import { seedInitialData } from './seed.js';

const CONNECT_ATTEMPTS = 10;
const CONNECT_RETRY_DELAY_MS = 3_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(config: AppConfig, logger: Logger): Promise<sql.ConnectionPool> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await createConnectionPool(config.database);
    } catch (error) {
      if (attempt >= CONNECT_ATTEMPTS) throw error;
      logger.warn(
        { attempt, maxAttempts: CONNECT_ATTEMPTS },
        'SQL Server no disponible, reintentando',
      );
      await wait(CONNECT_RETRY_DELAY_MS);
    }
  }
}

function registerGracefulShutdown(server: Server, pool: sql.ConnectionPool, logger: Logger): void {
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Cerrando la API');
    server.close(() => {
      void pool.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const pool = await connectWithRetry(config, logger);
  const db = new ProcedureExecutor(pool);
  const container = createContainer(config, db);

  await seedInitialData(config.seed, {
    users: container.userRepository,
    tasks: container.taskRepository,
    passwordHasher: container.passwordHasher,
    logger,
  });

  const app = createApp({
    config,
    logger,
    ...container,
    checkDatabase: () => db.ping(),
    failedAttemptsLimit: config.auth.failedAttemptsLimit,
  });
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'API escuchando');
  });

  registerGracefulShutdown(server, pool, logger);
}

main().catch((error: unknown) => {
  const message = error instanceof ConfigError ? error.message : String(error);
  process.stderr.write(`[task-manager-api] No se pudo iniciar: ${message}\n`);
  process.exit(1);
});
