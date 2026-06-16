import { MailerService } from '@nestjs-modules/mailer';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as ejs from 'ejs';
import { join } from 'path';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { Product } from 'src/products/entities/product.entity';
import { errorManagement } from 'src/utils/error.util';
import { RTAlertDTO } from './dto/rt-alert.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendRTAlertEmployees(alertData: RTAlertDTO, forSupportTeam: boolean) {
    try {
      const html = await this.renderTemplate(
        'refresh-token-alert-employees',
        alertData,
      );

      await this.mailerService.sendMail({
        to: forSupportTeam === true ? process.env.FROM_EMAIL : alertData.email,
        subject: 'Alerta de segurança',
        template: html,
        context: {
          ...alertData,
        },
      });

      this.logger.log(
        `Email enviado para ${forSupportTeam === true ? process.env.FROM_EMAIL : alertData.email}`,
      );

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email para ${forSupportTeam === true ? process.env.FROM_EMAIL : alertData.email}:`,
        error,
      );

      throw new InternalServerErrorException('Erro ao enviar email');
    }
  }

  async sendRTAlertUsers(alertData: RTAlertDTO, forSupportTeam: boolean) {
    try {
      const html = await this.renderTemplate('user-session-alert', alertData);

      await this.mailerService.sendMail({
        to: forSupportTeam === true ? process.env.FROM_EMAIL : alertData.email,
        subject: 'Alerta de segurança',
        template: html,
        context: {
          ...alertData,
        },
      });

      this.logger.log(
        `Email enviado para ${forSupportTeam === true ? process.env.FROM_EMAIL : alertData.email}`,
      );

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email para ${forSupportTeam === true ? process.env.FROM_EMAIL : alertData.email}:`,
        error,
      );

      throw new InternalServerErrorException('Erro ao enviar email');
    }
  }

  async logIssue(userOrEmployeeLog: string) {
    try {
      await this.mailerService.sendMail({
        to: process.env.FROM_EMAIL,
        subject: `Erro ao criar logs de ${userOrEmployeeLog}`,
        template: '<h1>Erro na criação de logs do usuário</h1>',
      });

      this.logger.log(`Email enviado para ${process.env.FROM_EMAIL}`);

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email para ${process.env.FROM_EMAIL}`,
        error,
      );

      throw new InternalServerErrorException('Erro ao enviar email');
    }
  }

  async resetPassword(userEmail: string, tokenHash: string) {
    try {
      const resetPasswordLink = `https://jubela-client.vercel.app/reset-senha/?token=${tokenHash}`;

      const html = await this.renderTemplate('password-reset', {
        resetPasswordLink,
      });

      await this.mailerService.sendMail({
        to: userEmail,
        subject: 'Redefinição de senha',
        template: html,
        context: {
          resetPasswordLink,
        },
      });

      this.logger.log(`Email enviado para ${userEmail}`);
    } catch (error) {
      this.logger.error(`Erro ao enviar email para ${userEmail}`, error);

      throw new InternalServerErrorException('Erro ao enviar email');
    } finally {
      return {
        success: true,
      };
    }
  }

  async lowStockWarn(product: Product) {
    try {
      const productData = {
        productRanOut: product.quantity < 1 ? true : false,
        productName: product.name,
        sku: product.sku,
        stock: product.quantity,
      };

      const html = await this.renderTemplate('stock-alert', productData);

      await this.mailerService.sendMail({
        to: process.env.FROM_EMAIL,
        subject: 'Produto com baixo estoque ou esgotado',
        template: html,
        context: {
          ...productData,
        },
      });

      this.logger.log(`Email enviado para ${process.env.FROM_EMAIL}`);

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email para ${process.env.FROM_EMAIL}:`,
        error,
      );

      throw new InternalServerErrorException('Erro ao enviar email');
    }
  }

  private async renderTemplate(templateFile: string, data: any) {
    try {
      const templatePath = join(__dirname, 'templates', `${templateFile}.ejs`);

      const html = (await ejs.renderFile(templatePath, data)) as string;
      return html;
    } catch (error) {
      errorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao renderizar template de email:',
        queryFailedError: '',
        internalServerError: 'Erro interno ao renderizar template',
        generalError: 'Erro ao renderizar template',
      });
    }
  }
}
