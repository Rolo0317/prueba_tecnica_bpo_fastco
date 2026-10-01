import { Router } from 'express';
import {
  createFailedAttemptsLimiter,
  type FailedAttemptsLimit,
} from '../../middlewares/rate-limit.js';
import { withValidation } from '../../middlewares/validate.js';
import type { AuthController } from './auth.controller.js';
import { loginSchemas } from './auth.schemas.js';

export function createAuthRouter(controller: AuthController, limit?: FailedAttemptsLimit): Router {
  const router = Router();

  router.post(
    '/login',
    createFailedAttemptsLimiter(limit),
    withValidation(loginSchemas, controller.login),
  );

  return router;
}
