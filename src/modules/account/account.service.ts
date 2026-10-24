import type { AuthContext } from '../../shared/auth/auth-context.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import type {
  AccountModelPort,
  AccountProviderError,
} from './account.model.js';

function throwDeletionError(
  step: string,
  error: AccountProviderError,
): never {
  logger.error({ step, ...error }, 'Account deletion failed');

  throw new AppError(
    503,
    'ACCOUNT_DELETION_UNAVAILABLE',
    'Account could not be deleted; try again later',
  );
}

export class AccountService {
  constructor(private readonly model: AccountModelPort) {}

  // Files go first: deleting the user cascades rows, but not Storage objects.
  async deleteAccount(auth: AuthContext): Promise<void> {
    const userId = auth.user.id;

    const media = await this.model.listObservationMediaPaths(userId);
    if (media.error) {
      throwDeletionError('list-observation-media', media.error);
    }

    const mediaRemoval = await this.model.removeFiles(
      'observations',
      media.paths,
    );
    if (mediaRemoval.error) {
      throwDeletionError('remove-observation-media', mediaRemoval.error);
    }

    const avatars = await this.model.listAvatarPaths(userId);
    if (avatars.error) {
      throwDeletionError('list-avatars', avatars.error);
    }

    const avatarRemoval = await this.model.removeFiles(
      'avatars',
      avatars.paths,
    );
    if (avatarRemoval.error) {
      throwDeletionError('remove-avatars', avatarRemoval.error);
    }

    const deletion = await this.model.deleteUser(userId);
    if (deletion.error) {
      throwDeletionError('delete-user', deletion.error);
    }

    logger.info('Account deleted');
  }
}
