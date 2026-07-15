import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class CronJobGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const CRONJOB_WHITELIST = [
      '116.203.134.67',
      '116.203.129.16',
      '23.88.105.37',
      '128.140.8.200',
      '91.99.23.109',
    ];

    const ip =
      request.headers['x-forwarded-for']?.split(',')[0].trim() ??
      request.socket.remoteAddress;

    if (!CRONJOB_WHITELIST.includes(ip)) {
      throw new UnauthorizedException('IP não autorizado');
    }

    const secret = request.headers['x-cron-secret'];
    const expected = process.env.CRONJOB_ORG_SECRET;

    if (!secret || !expected || !this.safeEqual(secret, expected)) {
      throw new UnauthorizedException('Secret inválido');
    }

    return true;
  }

  // Comparação em tempo constante para não vazar o segredo por timing.
  private safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    if (bufferA.length !== bufferB.length) return false;

    return timingSafeEqual(bufferA, bufferB);
  }
}
