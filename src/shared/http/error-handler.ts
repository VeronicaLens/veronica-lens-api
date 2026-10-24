import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';

function isBodyParserError(
  error: unknown,
  type: string,
  status: number,
): boolean {
  return (
    error instanceof Error &&
    'type' in error &&
    error.type === type &&
    'status' in error &&
    error.status === status
  );
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (isBodyParserError(error, 'entity.parse.failed', 400)) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
    return;
  }

  if (isBodyParserError(error, 'entity.too.large', 413)) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
      },
    });
    return;
  }

  req.log.error(
    {
        requestId: req.id,
        errorType: error instanceof Error ? error.name : typeof error,
    },
    'Unhandled request error',
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
    },
  });
};