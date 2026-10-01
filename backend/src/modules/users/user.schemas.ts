import { z } from 'zod';
import { ROLES } from './user.types.js';

/** Política de contraseñas: la misma regla se aplica al crear, restablecer y cambiar. */
export const passwordPolicy = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres.')
  .max(128, 'La contraseña admite máximo 128 caracteres.')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula.')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
  .regex(/\d/, 'Debe incluir al menos un número.');

const fullName = z.string().trim().min(1, 'El nombre es obligatorio.').max(100);
const role = z.enum(ROLES);
const userIdParams = z.object({ id: z.coerce.number().int().positive('El id no es válido.') });

export const listUsersSchemas = {
  query: z.object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
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
    role: role.default('AGENT'),
    password: passwordPolicy,
  }),
};

export const updateUserSchemas = {
  params: userIdParams,
  body: z.strictObject({ fullName, role }),
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
