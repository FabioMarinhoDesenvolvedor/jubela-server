import {
  HttpException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { ErrorMessages } from 'src/interfaces/error-messages';
import { QueryFailedError } from 'typeorm';
import { getErrorMessage } from './error-message.util';

export function errorManagement(
  error: unknown,
  generalErrorType: GeneralErrorType,
  messages: ErrorMessages,
): never {
  const logger = new Logger('errorManagement');
  const manageError = getErrorMessage(error);

  logger.error(
    `${messages.logger}: ${manageError}`,
    error instanceof Error ? error.stack : null,
  );

  if (error instanceof QueryFailedError) {
    throw new InternalServerErrorException(messages.queryFailedError);
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();

    if (status >= 500) {
      throw new InternalServerErrorException(messages.internalServerError);
    }

    throw error;
  }

  if (generalErrorType === GeneralErrorType.UNAUTHORIZED) {
    throw new UnauthorizedException(messages.generalError);
  }

  throw new InternalServerErrorException(messages.generalError);
}
