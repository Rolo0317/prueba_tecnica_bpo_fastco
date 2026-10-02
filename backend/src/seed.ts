import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import { ConflictError } from './core/errors.js';
import type { AccessService } from './modules/access/access.service.js';
import type { PasswordHasher } from './modules/auth/auth.types.js';
import type { TaskData, TaskRepository } from './modules/tasks/task.types.js';
import type { UserIdentity, UserRepository } from './modules/users/user.types.js';

interface SeedDependencies {
  users: UserRepository;
  tasks: TaskRepository;
  access: AccessService;
  passwordHasher: PasswordHasher;
  logger: Logger;
}

type SampleTask = Omit<TaskData, 'dueDate'> & {
  area: string;
  dueInDays: number | null;
  moveTo?: string[];
};

/**
 * Tareas de ejemplo de distintas áreas (solo si SEED_SAMPLE_TASKS=true): muestran que la app
 * sirve para cualquier equipo. Las áreas que falten se crean.
 */
const SAMPLE_TASKS: SampleTask[] = [
  {
    title: 'Devolver llamada a cliente por reclamo de facturación',
    area: 'Operaciones',
    description: 'Cliente reporta doble cobro en el último ciclo.',
    priority: 'HIGH',
    dueInDays: 0,
  },
  {
    title: 'Validar soporte de pago recibido',
    area: 'Finanzas',
    description: 'Comprobante adjunto por el cliente vía correo.',
    priority: 'HIGH',
    dueInDays: 1,
    moveTo: ['IN_PROGRESS'],
  },
  {
    title: 'Restablecer acceso a la VPN de un colaborador',
    area: 'TI',
    description: 'El usuario no puede conectarse desde casa.',
    priority: 'HIGH',
    dueInDays: 1,
  },
  {
    title: 'Actualizar datos de contacto de un proveedor',
    area: 'Compras',
    description: null,
    priority: 'MEDIUM',
    dueInDays: 3,
    moveTo: ['IN_PROGRESS', 'COMPLETED'],
  },
  {
    title: 'Publicar vacante de analista de datos',
    area: 'Talento Humano',
    description: 'Perfil aprobado por la gerencia.',
    priority: 'MEDIUM',
    dueInDays: 2,
  },
  {
    title: 'Programar inducción de personal nuevo',
    area: 'Talento Humano',
    description: 'Grupo de 5 personas que ingresa el lunes.',
    priority: 'MEDIUM',
    dueInDays: 2,
    moveTo: ['IN_PROGRESS'],
  },
  {
    title: 'Renovar licencias de antivirus',
    area: 'TI',
    description: 'Vencen a fin de mes.',
    priority: 'LOW',
    dueInDays: 4,
  },
  {
    title: 'Revisar muestra de llamadas para calidad',
    area: 'Calidad',
    description: 'Muestra semanal de monitoreo.',
    priority: 'LOW',
    dueInDays: 5,
  },
  {
    title: 'Gestionar solicitud de cambio de horario',
    area: 'Talento Humano',
    description: null,
    priority: 'MEDIUM',
    dueInDays: 6,
    moveTo: ['CANCELLED'],
  },
  {
    title: 'Conciliar pagos recibidos del día',
    area: 'Finanzas',
    description: 'Cruce con el reporte del banco.',
    priority: 'HIGH',
    dueInDays: 0,
    moveTo: ['IN_PROGRESS', 'COMPLETED'],
  },
  {
    title: 'Responder PQR recibida por canal web',
    area: 'Servicio al cliente',
    description: 'Plazo legal de respuesta: 15 días hábiles.',
    priority: 'MEDIUM',
    dueInDays: 10,
  },
  {
    title: 'Depurar base de datos de campaña',
    area: 'Operaciones',
    description: null,
    priority: 'LOW',
    dueInDays: null,
  },
];

const addDays = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function ensureAdminUser(
  seed: AppConfig['seed'],
  deps: SeedDependencies,
): Promise<UserIdentity> {
  const existing = await deps.users.findByUsername(seed.adminUsername);
  if (existing) return existing;

  try {
    const user = await deps.users.create({
      username: seed.adminUsername,
      passwordHash: await deps.passwordHasher.hash(seed.adminPassword),
      fullName: seed.adminFullName,
      roleId: await deps.access.findRoleIdByCode('ADMIN'),
      areaId: null,
      actorId: null,
    });
    deps.logger.info({ username: user.username }, 'Usuario inicial creado');
    return user;
  } catch (error) {
    // Otra instancia lo creó al mismo tiempo: se reutiliza.
    const created =
      error instanceof ConflictError && (await deps.users.findByUsername(seed.adminUsername));
    if (created) return created;
    throw error;
  }
}

/** Ids de las áreas de ejemplo por nombre; crea las que no existan. */
async function ensureSampleAreas(deps: SeedDependencies): Promise<Map<string, number>> {
  const ids = new Map((await deps.access.listAreas(true)).map((a) => [a.name, a.id]));
  for (const name of new Set(SAMPLE_TASKS.map((t) => t.area))) {
    if (!ids.has(name)) {
      ids.set(name, (await deps.access.createArea({ name, description: null })).id);
    }
  }
  return ids;
}

async function seedSampleTasks(owner: UserIdentity, deps: SeedDependencies): Promise<void> {
  const { total } = await deps.tasks.list({ page: 1, pageSize: 1, viewerId: owner.id });
  if (total > 0) return;

  const areaIds = await ensureSampleAreas(deps);
  for (const [index, { area, dueInDays, moveTo = [], ...task }] of SAMPLE_TASKS.entries()) {
    const dueDate = dueInDays === null ? null : addDays(dueInDays);
    // Para la demo: la mitad asignadas al administrador y la otra mitad sin asignar.
    const assignedTo = index % 2 === 0 ? owner.id : null;
    const created = await deps.tasks.create({
      ...task,
      dueDate,
      assignedTo,
      areaId: areaIds.get(area) ?? null,
      createdBy: owner.id,
    });
    for (const status of moveTo) {
      await deps.tasks.changeStatus({ taskId: created.id, status, changedBy: owner.id });
    }
  }
  deps.logger.info({ count: SAMPLE_TASKS.length }, 'Tareas de ejemplo creadas');
}

/** Datos iniciales idempotentes: usuario demo (hash bcrypt desde .env) y tareas de ejemplo. */
export async function seedInitialData(
  seed: AppConfig['seed'],
  deps: SeedDependencies,
): Promise<void> {
  const admin = await ensureAdminUser(seed, deps);
  if (seed.sampleTasks) {
    await seedSampleTasks(admin, deps);
  }
}
