import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import { ConflictError } from './core/errors.js';
import type { PasswordHasher } from './modules/auth/auth.types.js';
import type { CreateTaskInput, TaskRepository } from './modules/tasks/task.types.js';
import type { User, UserRepository } from './modules/users/user.types.js';

interface SeedDependencies {
  users: UserRepository;
  tasks: TaskRepository;
  passwordHasher: PasswordHasher;
  logger: Logger;
}

type SampleTask = Omit<CreateTaskInput, 'createdBy' | 'dueDate'> & {
  dueInDays: number | null;
  moveTo?: string[];
};

/** Tareas de ejemplo de una operación de back office (solo si SEED_SAMPLE_TASKS=true). */
const SAMPLE_TASKS: SampleTask[] = [
  { title: 'Devolver llamada a cliente por reclamo de facturación', description: 'Cliente reporta doble cobro en el último ciclo.', priority: 'HIGH', dueInDays: 0 },
  { title: 'Validar soporte de pago de acuerdo de cobranza', description: 'Comprobante adjunto por el cliente vía correo.', priority: 'HIGH', dueInDays: 1, moveTo: ['IN_PROGRESS'] },
  { title: 'Escalar reclamo a segundo nivel', description: 'Caso sin solución tras dos contactos.', priority: 'HIGH', dueInDays: 1 },
  { title: 'Actualizar datos de contacto del cliente', description: null, priority: 'MEDIUM', dueInDays: 3, moveTo: ['IN_PROGRESS', 'COMPLETED'] },
  { title: 'Enviar paz y salvo por correo', description: 'Obligación cancelada en su totalidad.', priority: 'MEDIUM', dueInDays: 2 },
  { title: 'Registrar promesa de pago en el sistema', description: null, priority: 'MEDIUM', dueInDays: 2, moveTo: ['IN_PROGRESS'] },
  { title: 'Programar rellamada de televentas', description: 'Cliente pidió contacto después de las 4 p. m.', priority: 'LOW', dueInDays: 4 },
  { title: 'Revisar grabación de llamada para calidad', description: 'Muestra semanal de monitoreo.', priority: 'LOW', dueInDays: 5 },
  { title: 'Gestionar solicitud de portabilidad', description: null, priority: 'MEDIUM', dueInDays: 6, moveTo: ['CANCELLED'] },
  { title: 'Conciliar pagos recibidos del día', description: 'Cruce con el reporte del banco.', priority: 'HIGH', dueInDays: 0, moveTo: ['IN_PROGRESS', 'COMPLETED'] },
  { title: 'Responder PQR recibida por canal web', description: 'Plazo legal de respuesta: 15 días hábiles.', priority: 'MEDIUM', dueInDays: 10 },
  { title: 'Depurar base de datos de campaña', description: null, priority: 'LOW', dueInDays: null },
];

const addDays = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function ensureAdminUser(seed: AppConfig['seed'], deps: SeedDependencies): Promise<User> {
  const existing = await deps.users.findByUsername(seed.adminUsername);
  if (existing) return existing;

  try {
    const user = await deps.users.create({
      username: seed.adminUsername,
      passwordHash: await deps.passwordHasher.hash(seed.adminPassword),
      fullName: seed.adminFullName,
    });
    deps.logger.info({ username: user.username }, 'Usuario inicial creado');
    return user;
  } catch (error) {
    // Otra instancia lo creó al mismo tiempo: se reutiliza.
    const created = error instanceof ConflictError && (await deps.users.findByUsername(seed.adminUsername));
    if (created) return created;
    throw error;
  }
}

async function seedSampleTasks(owner: User, deps: SeedDependencies): Promise<void> {
  const { total } = await deps.tasks.list({ page: 1, pageSize: 1 });
  if (total > 0) return;

  for (const { dueInDays, moveTo = [], ...task } of SAMPLE_TASKS) {
    const dueDate = dueInDays === null ? null : addDays(dueInDays);
    const created = await deps.tasks.create({ ...task, dueDate, createdBy: owner.id });
    for (const status of moveTo) {
      await deps.tasks.changeStatus({ taskId: created.id, status, changedBy: owner.id });
    }
  }
  deps.logger.info({ count: SAMPLE_TASKS.length }, 'Tareas de ejemplo creadas');
}

/** Datos iniciales idempotentes: usuario demo (hash bcrypt desde .env) y tareas de ejemplo. */
export async function seedInitialData(seed: AppConfig['seed'], deps: SeedDependencies): Promise<void> {
  const admin = await ensureAdminUser(seed, deps);
  if (seed.sampleTasks) {
    await seedSampleTasks(admin, deps);
  }
}
