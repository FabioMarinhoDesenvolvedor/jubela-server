import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { AuthTokenGuard } from 'src/auth/guards/auth-token.guard';
import { CsrfGuard } from 'src/auth/guards/csrf.guard';
import { ThrottlerBehindProxyGuard } from 'src/auth/guards/throttler-behind-proxy.guard';
import { EmailModule } from 'src/email/email.module';
import { EmployeesModule } from 'src/employees/employee.module';
import { JWTBlacklistModule } from 'src/jwt-blacklist/jwt-blacklist.module';
import { LogsModule } from 'src/logs-register/log.module';
import { OrdersModule } from 'src/orders/order.module';
import { ProductsModule } from 'src/products/product.module';
import { RefreshTokensModule } from 'src/refresh-tokens/refresh-token.module';
import { UsersModule } from 'src/users/user.module';
import appConfig from './app.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ConfigModule.forFeature(appConfig),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forFeature(appConfig)],
      inject: [appConfig.KEY],
      useFactory: async (appConfigParam: ConfigType<typeof appConfig>) => {
        // O app sempre roda compilado a partir de dist/ (tanto `start:dev`
        // quanto `start:prod` do Nest), e as migrations são compiladas para
        // dist/migrations/*.js. __dirname aqui é dist/src/app → sobe 2 níveis.
        const migrationsGlob = join(
          __dirname,
          '..',
          '..',
          'migrations',
          '*.js',
        );

        return {
          type: 'postgres',
          host: appConfigParam.host,
          port: appConfigParam.port,
          username: appConfigParam.username,
          database: appConfigParam.database,
          password: appConfigParam.password,
          autoLoadEntities: appConfigParam.autoLoadEntities,
          synchronize: appConfigParam.synchronize,
          // Roda migrations pendentes automaticamente na subida do app,
          // garantindo que colunas novas (ex.: promoção) existam no deploy.
          // Controlável por env (default LIGADO). Desligue com
          // DATABASE_MIGRATIONS_RUN=false se precisar subir sem migrar — ex.:
          // banco novo, cuja cadeia histórica não roda do zero (algumas
          // migrations assumem colunas criadas por synchronize).
          migrations: [migrationsGlob],
          migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false',
        };
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
      {
        name: 'write',
        ttl: 10000,
        limit: 10,
      },
      {
        name: 'read',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'global',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'preference',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'refresh',
        ttl: 60000,
        limit: 10,
      },
    ]),
    EmployeesModule,
    ProductsModule,
    OrdersModule,
    UsersModule,
    AuthModule,
    RefreshTokensModule,
    JWTBlacklistModule,
    LogsModule,
    EmailModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Roda antes dos demais: barra requisições mutantes sem o header custom
    // (defesa CSRF) antes de qualquer trabalho de autenticação.
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule {}
