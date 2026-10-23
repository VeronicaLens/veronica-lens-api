import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found'));
};