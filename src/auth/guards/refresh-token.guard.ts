import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { RefreshTokenEmployee } from 'src/refresh-tokens/entities/refresh-token-employee.entity';
import { RefreshTokenUser } from 'src/refresh-tokens/entities/refresh-token-user.entity';
import { errorManagement } from 'src/utils/error.util';
import { Repository } from 'typeorm';
import jwtConfig from '../config/jwt.config';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly logger: Logger,

    @InjectRepository(RefreshTokenEmployee)
    private readonly RTEmployeeRepository: Repository<RefreshTokenEmployee>,

    @InjectRepository(RefreshTokenUser)
    private readonly RTUserRepository: Repository<RefreshTokenUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const token = request.cookies['refreshToken'];

    if (!token) {
      throw new UnauthorizedException('Não logado');
    }

    try {
      await this.jwtService.verifyAsync(token, this.jwtConfiguration);

      (request as any).refreshToken = token;

      return true;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        await this.invalidateExpiredToken(token);
        throw new UnauthorizedException(
          'Sessão expirada, faça login novamente',
        );
      }

      errorManagement(error, GeneralErrorType.UNAUTHORIZED, {
        logger: 'RefreshTokenError:',
        queryFailedError: 'Erro na busca de dados para re-autenticação',
        internalServerError: 'Erro interno ao realizar re-autenticação',
        generalError: 'Falha ao re-autenticar',
      });
    }
  }

  extractTokenFromHeader(request: Request): string | undefined {
    const refreshToken = request.body.refreshToken;

    if (!refreshToken || typeof refreshToken !== 'string') return;

    return refreshToken;
  }

  private extractTokenData(token: string) {
    const payload = this.jwtService.decode(token) as {
      id?: string;
      sub?: string;
      role?: string;
    };

    if (!payload?.id) return;

    return payload;
  }

  private async invalidateExpiredToken(token: string): Promise<void> {
    try {
      const extractedData = this.extractTokenData(token);

      if (extractedData) {
        const { role, id } = extractedData;

        if (role) {
          const rtEmployeeUpdate = await this.RTEmployeeRepository.update(
            { token_id: id },
            { is_valid: false },
          );

          if (!rtEmployeeUpdate || rtEmployeeUpdate.affected === 0) {
            this.logger.error(
              'Erro ao atualizar estado de token do funcionário',
            );
          }
        }

        const rtUserUpdate = await this.RTUserRepository.update(
          { token_id: id },
          { is_valid: false },
        );

        if (!rtUserUpdate || rtUserUpdate.affected === 0) {
          this.logger.error('Erro ao atualizar estado de token do usuário');
        }
      }
    } catch (err) {
      errorManagement(err, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao invalidar token',
        queryFailedError: 'Erro na atualização de dados de token',
        internalServerError: 'Erro interno ao invalidar token',
        generalError: 'Falha ao invalidar token',
      });
    }
  }
}
