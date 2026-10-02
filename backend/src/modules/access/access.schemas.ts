import { z } from 'zod';
import { PERMISSIONS } from './access.types.js';

const idParams = z.object({ id: z.coerce.number().int().positive('El id no es válido.') });

const description = z
  .string()
  .trim()
  .max(200, 'La descripción admite máximo 200 caracteres.')
  .nullish()
  .transform((value) => (value === '' ? null : (value ?? null)));

const roleBody = z.strictObject({
  name: z.string().trim().min(1, 'El nombre del rol es obligatorio.').max(50),
  description,
  permissions: z
    .array(z.enum(PERMISSIONS))
    .max(PERMISSIONS.length)
    .transform((list) => [...new Set(list)]),
});

export const createRoleSchemas = { body: roleBody };
export const updateRoleSchemas = { params: idParams, body: roleBody };
export const deleteRoleSchemas = { params: idParams };

export const listAreasSchemas = {
  query: z.object({
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
};

const areaName = z.string().trim().min(1, 'El nombre del área es obligatorio.').max(80);

export const createAreaSchemas = {
  body: z.strictObject({ name: areaName, description }),
};

export const updateAreaSchemas = {
  params: idParams,
  body: z.strictObject({ name: areaName, description, isActive: z.boolean() }),
};
