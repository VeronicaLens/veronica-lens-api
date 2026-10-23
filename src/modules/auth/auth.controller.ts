import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { parseBody } from '../../shared/http/parse-body.js';
import {
  refreshSessionSchema,
  signInSchema,
  signUpSchema,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  signUp = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(signUpSchema, req.body);
    const result = await this.service.signUp(input);

    res.status(result.confirmationRequired ? 202 : 201).json({
      data: result,
    });
  };

  signIn = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(signInSchema, req.body);
    const result = await this.service.signIn(input);

    res.status(200).json({
      data: result,
    });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const input = parseBody(refreshSessionSchema, req.body);
    const result = await this.service.refresh(input);

    res.status(200).json({
      data: result,
    });
  };

  me = (req: Request, res: Response): void => {
    if (!req.auth) {
      throw new AppError(
        401,
        'AUTH_REQUIRED',
        'Authentication is required',
      );
    }

    res.status(200).json({
      data: {
        user: req.auth.user,
      },
    });
  };
}