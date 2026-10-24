import type { Request, Response } from 'express';

import { parseBody } from '../../shared/http/parse-body.js';
import { skyPositionsSchema } from './sky-guide.schemas.js';
import type { SkyGuideService } from './sky-guide.service.js';

export class SkyGuideController {
  constructor(private readonly service: SkyGuideService) {}

  positions = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(skyPositionsSchema, req.body);
    const result = await this.service.getPositions(input);

    res.status(200).json({ data: result });
  };
}
