import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/adapters/ejs.adapter';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { Order } from 'src/orders/entities/order.entity';
import { OrdersModule } from 'src/orders/order.module';
import emailConfig from './config/email.config';
import { EmailService } from './email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    ConfigModule.forFeature(emailConfig),
    forwardRef(() => OrdersModule),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: {
            user: config.get<string>('BREVO_SMTP_USER'),
            pass: config.get<string>('BREVO_SMTP_PASS'),
          },
        },
        defaults: {
          from: config.get<string>('FROM_EMAIL'),
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new EjsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
