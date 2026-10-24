import type { Request, Response } from 'express';

import { parseBody } from '../../shared/http/parse-body.js';
import {
  conditionsForecastSchema,
  currentConditionsSchema,
} from './conditions.schemas.js';
import type { ConditionsService } from './conditions.service.js';

export class ConditionsController {
  constructor(private readonly service: ConditionsService) {}

  current = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(currentConditionsSchema, req.body);

    res.status(200).json({ data: await this.service.getCurrent(input) });
  };

  forecast = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(conditionsForecastSchema, req.body);

    res.status(200).json({ data: await this.service.getForecast(input) });
  };
}
