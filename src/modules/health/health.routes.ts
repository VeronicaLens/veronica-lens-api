import { Router, type Request, type Response } from 'express';

import type { HealthService } from './health.service.js';

export function createHealthRouter(service: HealthService): Router {
  const router = Router();

  router.get('/connectivity', async (_req: Request, res: Response) => {
    const report = await service.getConnectivity();

    res.status(report.status === 'ok' ? 200 : 503).json({ data: report });
  });

  return router;
}
