import { Router } from 'express';

export type HealthCheck = () => Promise<void>;

/** Healthcheck para Docker: 200 si la API llega a la base de datos, 503 si no. */
export function createHealthRouter(checkDatabase: HealthCheck): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await checkDatabase();
      res.status(200).json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
