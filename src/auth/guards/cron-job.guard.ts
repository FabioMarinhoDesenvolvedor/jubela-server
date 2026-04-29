// guards/cron-job.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class CronJobGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    console.log(request);

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

    console.log(ip);

    if (!CRONJOB_WHITELIST.includes(ip)) {
      throw new UnauthorizedException('IP não autorizado');
    }

    const secret = request.headers['x-cron-secret'];

    if (secret !== process.env.CRONJOB_ORG_SECRET) {
      throw new UnauthorizedException('Secret inválido');
    }

    return true;
  }
}
