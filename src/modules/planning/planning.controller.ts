import type { Request, Response } from 'express';

import { parseBody } from '../../shared/http/parse-body.js';
import { recommendationSchema } from './planning.schemas.js';
import type { PlanningService } from './planning.service.js';

export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  recommend = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(recommendationSchema, req.body);

    res.status(200).json({ data: await this.service.recommend(input) });
  };
}
