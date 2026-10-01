import { z } from 'zod';

export const loginSchemas = {
  body: z.strictObject({
    username: z.string().trim().min(1, 'El usuario es obligatorio.').max(50),
    password: z.string().min(1, 'La contraseña es obligatoria.').max(128),
  }),
};
