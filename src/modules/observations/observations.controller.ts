import type { Request, Response } from 'express';
import type { ZodType } from 'zod';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import { parseQuery } from '../../shared/http/parse-query.js';
import { isObservationPhotoContentType } from './observation-photo.js';
import {
  observationHistoryQuerySchema,
  observationParamsSchema,
  observationPhotoMetadataSchema,
  observationPhotoParamsSchema,
  type ObservationPhotoMetadata,
} from './observations.schemas.js';
import type { ObservationsService } from './observations.service.js';

// Capture metadata travels in a header because the body is the raw image bytes.
export const CAPTURE_METADATA_HEADER = 'x-veronica-observation';

export class ObservationsController {
  constructor(private readonly service: ObservationsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const query = parseQuery(observationHistoryQuerySchema, req.query);
    const page = await this.service.list(auth, query);

    res.status(200).json({ data: page });
  };

  savePhoto = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const params = parseParams(
      observationPhotoParamsSchema,
      req.params,
      'Observation photo request is invalid',
    );
    const contentType = req
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();

    if (!isObservationPhotoContentType(contentType)) {
      throw new AppError(
        415,
        'PHOTO_TYPE_UNSUPPORTED',
        'Astrophoto must be a JPEG, PNG, WebP, HEIC or HEIF image',
      );
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new AppError(400, 'PHOTO_INVALID', 'Astrophoto file is empty');
    }

    const metadata = parseCaptureMetadata(req.get(CAPTURE_METADATA_HEADER));
    const photo = await this.service.savePhoto(auth, {
      ...params,
      contentType,
      bytes: req.body,
      metadata,
    });

    res.status(200).json({ data: { photo } });
  };

  deletePhoto = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const params = parseParams(
      observationPhotoParamsSchema,
      req.params,
      'Observation photo request is invalid',
    );
    const result = await this.service.deletePhoto(auth, params);

    res.status(200).json({ data: result });
  };

  deleteObservation = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const params = parseParams(
      observationParamsSchema,
      req.params,
      'Observation request is invalid',
    );
    await this.service.deleteObservation(auth, params);

    res.status(204).end();
  };
}

function parseParams<T>(schema: ZodType<T>, params: unknown, message: string): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

function parseCaptureMetadata(
  encoded: string | undefined,
): ObservationPhotoMetadata {
  let candidate: unknown = null;
  if (encoded) {
    try {
      candidate = JSON.parse(decodeURIComponent(encoded));
    } catch {
      candidate = null;
    }
  }

  const result = observationPhotoMetadataSchema.safeParse(candidate);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Observation photo metadata is invalid',
    );
  }
  return result.data;
}
