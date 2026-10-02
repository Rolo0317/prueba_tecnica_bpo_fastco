import { z } from 'zod';

/** Política de contraseñas: la misma regla se aplica al crear, restablecer y cambiar. */
export const passwordPolicy = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres.')
  .max(128, 'La contraseña admite máximo 128 caracteres.')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula.')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
  .regex(/\d/, 'Debe incluir al menos un número.');

const fullName = z.string().trim().min(1, 'El nombre es obligatorio.').max(100);
/** Rol y área asignados al usuario (el SP valida que existan y que no haya escalada). */
const assignment = {
  roleId: z.number({ error: 'Selecciona un rol.' }).int().positive('Selecciona un rol.'),
  areaId: z
    .number()
    .int()
    .positive('El área no es válida.')
    .nullish()
    .transform((value) => value ?? null),
};
/** Correo opcional ('' o null = sin correo); se guarda en minúsculas. */
const email = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .email('El correo no tiene un formato válido.')
    .max(254)
    .transform((value) => value.toLowerCase())
    .nullish(),
);
const userIdParams = z.object({ id: z.coerce.number().int().positive('El id no es válido.') });

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);
const optionalId = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());

export const listUsersSchemas = {
  query: z.object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    roleId: optionalId,
    areaId: optionalId,
    status: z.preprocess(emptyToUndefined, z.enum(['ACTIVE', 'INACTIVE']).optional()),
    pendingReset: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
};

export const createUserSchemas = {
  body: z.strictObject({
    username: z
      .string()
      .trim()
      .min(3, 'El usuario debe tener al menos 3 caracteres.')
      .max(50)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras sin tilde, números, punto, guion y guion bajo.'),
    fullName,
    email: email.transform((value) => value ?? null),
    ...assignment,
    password: passwordPolicy,
  }),
};

export const updateUserSchemas = {
  params: userIdParams,
  body: z.strictObject({ fullName, email, ...assignment }),
};

export const setUserStatusSchemas = {
  params: userIdParams,
  body: z.strictObject({ isActive: z.boolean() }),
};

export const deleteUserSchemas = { params: userIdParams };

export const resetPasswordSchemas = {
  params: userIdParams,
  body: z.strictObject({ newPassword: passwordPolicy }),
};

export const changeOwnPasswordSchemas = {
  body: z.strictObject({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual.').max(128),
    newPassword: passwordPolicy,
  }),
};
