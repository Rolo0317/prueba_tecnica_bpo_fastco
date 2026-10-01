import { z } from 'zod';
import { PRIORITY_CODES } from './task.types.js';

/** Los estados son datos del catálogo en BD: aquí solo se valida el formato y el SP valida que exista. */
const statusCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z_]{1,20}$/, 'El estado no tiene un formato válido.');

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const taskIdParams = z.object({
  id: z.coerce.number().int().positive('El id de la tarea no es válido.'),
});

/** Campos de una tarea, comunes a crear y editar (DRY). */
const taskBody = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1, 'El título es obligatorio.')
    .max(150, 'El título admite máximo 150 caracteres.'),
  description: z
    .string()
    .trim()
    .max(1000, 'La descripción admite máximo 1000 caracteres.')
    .nullish()
    .transform((value) => (value === '' ? null : (value ?? null))),
  priority: z.enum(PRIORITY_CODES).default('MEDIUM'),
  dueDate: z.iso
    .date('La fecha límite debe tener el formato AAAA-MM-DD.')
    .nullish()
    .transform((value) => value ?? null),
  /** Responsable: id de usuario, null = sin asignar, ausente = no cambiar / valor por defecto. */
  assignedTo: z.number().int().positive('El responsable no es válido.').nullable().optional(),
});

export const listTasksSchemas = {
  query: z.object({
    status: z.preprocess(emptyToUndefined, statusCode.optional()),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  }),
};

export const createTaskSchemas = { body: taskBody };

export const updateTaskSchemas = { params: taskIdParams, body: taskBody };

/** today: fecha local del usuario, para calcular vencidas y las que vencen hoy. */
export const taskStatsSchemas = {
  query: z.object({
    today: z.iso
      .date('La fecha debe tener el formato AAAA-MM-DD.')
      .optional()
      .transform((value) => value ?? null),
  }),
};

export const changeTaskStatusSchemas = {
  params: taskIdParams,
  body: z.strictObject({ status: statusCode }),
};
