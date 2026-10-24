import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';

import { logger } from '../logging/logger.js';

export const requestLogger = pinoHttp({
  logger,
  wrapSerializers: false,

  genReqId(_req, res) {
    const requestId = randomUUID();

    res.setHeader('X-Request-Id', requestId);

    return requestId;
  },

  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
      };
    },

    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },

    err(error) {
      return {
        type: error instanceof Error ? error.name : typeof error,
      };
    },
  },
});