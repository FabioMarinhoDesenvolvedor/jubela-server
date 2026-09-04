import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app/app.module';
import { getAllowedOrigins } from './common/allowed-origins';

// Falha rápido se um segredo obrigatório não estiver configurado, em vez de
// subir com JWT_SECRET undefined (tokens assináveis por qualquer um) ou sem
// acesso ao banco.
function assertRequiredEnv() {
  // Apenas o que é indispensável para o app funcionar — não subir sem isso é
  // melhor do que subir quebrado (JWT_SECRET undefined, banco inacessível).
  const required = [
    'JWT_SECRET',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_USERNAME',
    'DATABASE_PASSWORD',
    'DATABASE_NAME',
  ];

  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`,
    );
  }
}

async function bootstrap() {
  assertRequiredEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const logger = new Logger('Bootstrap');

  app.set('trust proxy', 1);

  app.use(helmet());

  app.use(cookieParser());

  app.useBodyParser('json', {
    limit: '2mb',
  });

  app.useBodyParser('urlencoded', {
    limit: '2mb',
    extended: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const allowedOrigins = getAllowedOrigins();

  const isDevelopment = process.env.NODE_ENV === 'development';

  logger.log(`Environment: ${isDevelopment ? 'development' : 'production'}`);
  logger.log(`Allowed origins: ${allowedOrigins.join(', ')}`);

  app.enableCors({
    origin: (origin, callback) => {
      // permite chamadas sem origin (Postman/curl)
      if (!origin) {
        if (isDevelopment) {
          logger.debug('CORS: Request without origin (allowed in dev)');
          return callback(null, true);
        } else {
          logger.warn('CORS: Request without origin blocked in production');
          return callback(null, false);
        }
      }

      if (allowedOrigins.includes(origin)) {
        logger.debug(`CORS: Allowed origin: ${origin}`);
        return callback(null, true);
      }

      // Bloqueia origin não autorizado
      logger.warn(`CORS: Blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 3600,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
