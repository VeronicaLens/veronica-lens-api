import type { Request, Response } from 'express';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import { parseBody } from '../../shared/http/parse-body.js';
import {
  learningIdSchema,
  trackSlugSchema,
  updateProgressSchema,
} from './learning.schemas.js';
import type { LearningService } from './learning.service.js';

export class LearningController {
  constructor(private readonly service: LearningService) {}

  listTracks = async (req: Request, res: Response): Promise<void> => {
    const tracks = await this.service.listTracks(requireAuth(req));

    res.status(200).json({ data: { tracks }, meta: { count: tracks.length } });
  };

  getTrack = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const slug = trackSlugSchema.safeParse(req.params.slug);

    // Malformed slugs cannot exist; avoid sending them to the database.
    if (!slug.success) {
      throw new AppError(404, 'TRACK_NOT_FOUND', 'Learning track was not found');
    }

    const track = await this.service.getTrackBySlug(auth, slug.data);

    res.status(200).json({ data: { track } });
  };

  getLesson = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const id = learningIdSchema.safeParse(req.params.id);

    if (!id.success) {
      throw new AppError(404, 'LESSON_NOT_FOUND', 'Learning lesson was not found');
    }

    const lesson = await this.service.getLessonById(auth, id.data);

    res.status(200).json({ data: { lesson } });
  };

  updateProgress = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const id = learningIdSchema.safeParse(req.params.id);

    if (!id.success) {
      throw new AppError(404, 'LESSON_NOT_FOUND', 'Learning lesson was not found');
    }

    const input = parseBody(updateProgressSchema, req.body);
    const progress = await this.service.updateProgress(auth, id.data, input);

    res.status(200).json({ data: { progress } });
  };
}
