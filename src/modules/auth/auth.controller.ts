import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { parseBody } from '../../shared/http/parse-body.js';
import {
  refreshSessionSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from './auth.schemas.js';
import { passwordRecoverySchema } from './auth.schemas.js';
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

  signOut = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new AppError(
        401,
        'AUTH_REQUIRED',
        'Authentication is required',
      );
    }

    await this.service.signOut(req.auth.accessToken);

    res.status(204).send();
  };

  requestPasswordRecovery = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const input = parseBody(passwordRecoverySchema, req.body);

    await this.service.requestPasswordRecovery(input.email);

    res.status(202).json({
      data: {
        message:
          'If the account exists, password recovery instructions were sent.',
      },
    });
  };

  updatePassword = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new AppError(
        401,
        'AUTH_REQUIRED',
        'Authentication is required',
      );
    }

    const input = parseBody(updatePasswordSchema, req.body);
    const user = await this.service.updatePassword(req.auth, input);

    res.status(200).json({
      data: { user },
    });
  };
}