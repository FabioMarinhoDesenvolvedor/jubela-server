import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { errorManagement } from 'src/utils/error.util';
import { Repository } from 'typeorm';
import { JWTBlacklist } from '../../jwt-blacklist/entities/jwt_blacklist.entity';
import { IS_PUBLIC_KEY, REQUEST_TOKEN_PAYLOAD_KEY } from '../auth.constants';
import jwtConfig from '../config/jwt.config';

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,

    @InjectRepository(JWTBlacklist)
    private readonly jwtBlacklist: Repository<JWTBlacklist>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const token = request.cookies['accessToken'];

    if (!token) {
      throw new UnauthorizedException('Não logado');
    }

    const isLoggedOut = await this.jwtBlacklist.findOne({
      where: {
        token,
      },
    });

    if (isLoggedOut) {
      throw new UnauthorizedException('Usuário deslogado');
    }

    try {
      const payload = await this.jwtService.verifyAsync(
        token,
        this.jwtConfiguration,
      );

      request[REQUEST_TOKEN_PAYLOAD_KEY] = payload;

      return true;
    } catch (error) {
      errorManagement(error, GeneralErrorType.UNAUTHORIZED, {
        logger: 'Erro na verificação do token - autenticação',
        queryFailedError: 'Erro na busca de dados para autenticação',
        internalServerError: 'Erro interno ao realizar autenticação',
        generalError: 'Falha ao autenticar',
      });
    }
  }

  extractTokenFromHeader(request: Request): string | undefined {
    const authorization = request.headers?.authorization;

    if (!authorization || typeof authorization !== 'string') return;

    return authorization.split(' ')[1];
  }
}
