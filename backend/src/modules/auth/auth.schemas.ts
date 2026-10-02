import { z } from 'zod';
import { passwordPolicy } from '../users/user.schemas.js';

/** Solución del captcha (la verifica la guarda antes de validar el resto). */
const captcha = z.string().max(2000).optional();
const username = z.string().trim().min(1, 'El usuario es obligatorio.').max(50);

export const loginSchemas = {
  body: z.strictObject({
    username,
    password: z.string().min(1, 'La contraseña es obligatoria.').max(128),
    captcha,
  }),
};

/** "¿Olvidaste tu contraseña?": usuario o correo. */
export const passwordResetRequestSchemas = {
  body: z.strictObject({
    username: z.string().trim().min(1, 'Ingresa tu usuario o correo.').max(254),
    captcha,
  }),
};

/** Enlace del correo: token aleatorio de 32 bytes en base64url + la contraseña nueva. */
export const passwordResetSchemas = {
  body: z.strictObject({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'El enlace no es válido.'),
    newPassword: passwordPolicy,
  }),
};
