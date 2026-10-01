import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url())),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
  DB_NAME: z.string().min(1),
  DB_APP_USER: z.string().min(1),
  DB_APP_PASSWORD: z.string().min(1),
  DB_ENCRYPT: booleanString.default(true),
  DB_TRUST_SERVER_CERTIFICATE: booleanString.default(false),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'Formato esperado: número + s|m|h|d (ej. 1h)')
    .default('1h'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  SEED_ADMIN_USERNAME: z.string().trim().min(3).max(50),
  SEED_ADMIN_PASSWORD: z.string().min(8),
  SEED_ADMIN_FULL_NAME: z.string().trim().min(1).max(100),
  SEED_SAMPLE_TASKS: booleanString.default(false),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  logLevel: Env['LOG_LEVEL'];
  port: number;
  trustProxy: number;
  corsOrigins: string[];
  database: {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    bcryptSaltRounds: number;
    /** Intentos fallidos permitidos (login / cambio de contraseña) por IP y ventana. */
    failedAttemptsLimit: { limit: number; windowMs: number };
  };
  seed: {
    adminUsername: string;
    adminPassword: string;
    adminFullName: string;
    sampleTasks: boolean;
  };
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuración inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Valida las variables de entorno y construye la configuración tipada (falla rápido). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    // Solo se reportan nombres de variables y reglas, nunca sus valores.
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const env = result.data;

  return {
    env: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.API_PORT,
    trustProxy: env.TRUST_PROXY,
    corsOrigins: env.CORS_ORIGINS,
    database: {
      server: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_APP_USER,
      password: env.DB_APP_PASSWORD,
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
      failedAttemptsLimit: {
        limit: env.AUTH_MAX_FAILED_ATTEMPTS,
        windowMs: env.AUTH_LOCKOUT_MINUTES * 60_000,
      },
    },
    seed: {
      adminUsername: env.SEED_ADMIN_USERNAME,
      adminPassword: env.SEED_ADMIN_PASSWORD,
      adminFullName: env.SEED_ADMIN_FULL_NAME,
      sampleTasks: env.SEED_SAMPLE_TASKS,
    },
  };
}
