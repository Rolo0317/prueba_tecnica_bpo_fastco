import { Router } from 'express';
import {
  createFailedAttemptsLimiter,
  type FailedAttemptsLimit,
} from '../../middlewares/rate-limit.js';
import { withValidation } from '../../middlewares/validate.js';
import type { UserController } from './user.controller.js';
import {
  changeOwnPasswordSchemas,
  createUserSchemas,
  deleteUserSchemas,
  listUsersSchemas,
  resetPasswordSchemas,
  setUserStatusSchemas,
  updateUserSchemas,
} from './user.schemas.js';

/** Administración de usuarios (se monta detrás de requireRole('ADMIN')). */
export function createUserRouter(controller: UserController): Router {
  const router = Router();

  router.get('/', withValidation(listUsersSchemas, controller.list));
  router.get('/assignable', controller.listAssignable);
  router.post('/', withValidation(createUserSchemas, controller.create));
  router.patch('/:id', withValidation(updateUserSchemas, controller.update));
  router.patch('/:id/status', withValidation(setUserStatusSchemas, controller.setStatus));
  router.delete('/:id', withValidation(deleteUserSchemas, controller.remove));
  router.put('/:id/password', withValidation(resetPasswordSchemas, controller.resetPassword));

  return router;
}

/** Cuenta propia: disponible para cualquier usuario autenticado. */
export function createAccountRouter(
  controller: UserController,
  limit?: FailedAttemptsLimit,
): Router {
  const router = Router();

  // Verifica la contraseña actual: se limita igual que el login.
  router.put(
    '/password',
    createFailedAttemptsLimiter(limit),
    withValidation(changeOwnPasswordSchemas, controller.changeOwnPassword),
  );

  return router;
}
