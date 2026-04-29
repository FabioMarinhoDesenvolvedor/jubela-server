import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { CronJobGuard } from 'src/auth/guards/cron-job.guard';
import { TokenPayloadParam } from 'src/auth/params/token-payload.param';
import { EmailService } from 'src/email/email.service';
import { Order } from 'src/orders/entities/order.entity';
import { DataSource, Repository } from 'typeorm';
import { CheckoutService } from './checkout.service';
import { CancelDTO } from './dto/cancel.dto';
import { OrderDTO } from './dto/order.dto';
import { PartialRefundDTO } from './dto/partial-refund.dto';
import { RefundDTO } from './dto/refund.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly checkoutService: CheckoutService,
    private readonly emaillSerive: EmailService,
    private readonly logger: Logger,
    private dataSource: DataSource,
  ) {}

  @SkipThrottle({ read: true, auth: true, refresh: true })
  @Post('checkout')
  async Create(
    @Body() orderDTO: OrderDTO,
    @TokenPayloadParam() tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const { url } = await this.checkoutService.CreateCheckout(
      orderDTO,
      tokenPayloadDTO,
    );

    return url;
  }

  @Post('webhook')
  @HttpCode(200)
  async HandleWebhook(@Body() body: any) {
    const { order_nsu, paid_amount, capture_method, transaction_nsu } = body;

    const processPayment =
      await this.checkoutService.ProcessPaymentNotification(
        transaction_nsu,
        order_nsu,
      );

    if (processPayment === 'ok') {
      return {
        success: true,
        message: 'Pagamento já processado',
      };
    }

    this.logger.log(
      `Pedido ${order_nsu} pago via ${capture_method}: R$ ${paid_amount / 100}`,
    );

    return { received: true };
  }

  @UseGuards(CronJobGuard)
  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Post('payment-check/:orderId')
  async CheckPayment(
    @Param('orderId') orderId: string,
    @Headers('x-cron-secret') secret: string,
  ) {
    if (secret !== process.env.CRONJOB_ORG_SECRET) {
      throw new UnauthorizedException();
    }

    await this.checkoutService.CheckPaymentStatus(orderId);
    return { ok: true };
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Post('orders/:orderId/refund')
  async RefundOrder(
    @Param('orderId') orderId: string,
    @Body() refundDto: RefundDTO,
    @TokenPayloadParam() tokenPayload: TokenPayloadDTO,
  ) {
    const result = await this.checkoutService.RefundOrder(
      orderId,
      refundDto,
      tokenPayload,
    );

    return {
      success: true,
      message: 'Estorno processado com sucesso',
      data: result,
    };
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Post('orders/:orderId/refund-partial')
  async RefundPartial(
    @Param('orderId') orderId: string,
    @Body() partialRefunDTO: PartialRefundDTO,
    @TokenPayloadParam() tokenPayload: TokenPayloadDTO,
  ) {
    const result = await this.checkoutService.RefundOrderPartial(
      orderId,
      partialRefunDTO,
      tokenPayload,
    );

    return {
      success: true,
      message: 'Estorno parcial processado com sucesso',
      data: result,
    };
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Patch('orders/:orderId/cancel')
  async CancelOrder(
    @Param('orderId') orderId: string,
    @Body() cancelDto: CancelDTO,
    @TokenPayloadParam() tokenPayload: TokenPayloadDTO,
  ) {
    const result = await this.checkoutService.CancelOrder(
      orderId,
      cancelDto,
      tokenPayload,
    );

    return {
      success: true,
      message: 'Pedido cancelado com sucesso',
      data: result,
    };
  }

  // @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  // @Public()
  // @Post('webhooks/mercadopago')
  // async Handle(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
  //   try {
  //     const xSignature = req.headers['x-signature'] as string;
  //     const xRequestedId = req.headers['x-request-id'] as string;
  //     const dataId = req.body?.data?.id;

  //     this.logger.log('Webhook recebido:', JSON.stringify(req.body));

  //     if (!xSignature || !xRequestedId || !dataId) {
  //       this.logger.warn('Headers ou data.id ausentes no webhook');
  //       return res.status(HttpStatus.BAD_REQUEST).json({
  //         error: 'Daods ou cabeçalhos necessários não fornecidos',
  //       });
  //     }

  //     const isValid = this.ValidateSignature(xSignature, xRequestedId, dataId);

  //     if (!isValid) {
  //       this.logger.warn('Assinatura inválida no webhook');
  //       return res.status(HttpStatus.UNAUTHORIZED).json({
  //         error: 'Invalid signature',
  //       });
  //     }

  //     const { data, type } = req.body;

  //     if (type === 'payment' && data?.id) {
  //       await this.ProcessPaymentNotification(data.id);
  //     }

  //     return res.status(HttpStatus.OK).json({ success: true });
  //   } catch (error) {
  //     this.logger.error('Erro ao processar webhook:', error.message);
  //     return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
  //       error: 'Webhook processing failed',
  //     });
  //   }
  // }

  // private ValidateSignature(
  //   signature: string,
  //   requestId: string,
  //   dataId: string,
  // ): boolean {
  //   try {
  //     const parts = signature.split(',');
  //     let ts = '';
  //     let hash = '';

  //     parts.forEach((part) => {
  //       const [key, value] = part.split('=');

  //       if (key && value) {
  //         if (key.trim() === 'ts') ts = value;
  //         if (key.trim() === 'v1') hash = value;
  //       }
  //     });

  //     if (!ts || !hash) {
  //       this.logger.warn('Formato de assinatura inválido');
  //       return false;
  //     }

  //     const currentTime = Math.floor(Date.now() / 1000);
  //     const requestTime = parseInt(ts);
  //     const timeDiff = Math.abs(currentTime - requestTime);

  //     if (timeDiff > 300) {
  //       // 5 minutos de tolerância
  //       this.logger.warn(`Webhook com timestamp expirado. Diff: ${timeDiff}s`);
  //       return false;
  //     }

  //     const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  //     const secret = this.mercadoPagoConfiguration.webhookSecret;
  //     const expectedHash = crypto
  //       .createHmac('sha256', secret)
  //       .update(manifest)
  //       .digest('hex');

  //     return crypto.timingSafeEqual(
  //       Buffer.from(hash),
  //       Buffer.from(expectedHash),
  //     );
  //   } catch (error) {
  //     this.logger.error('Erro ao validar assinatura:', error.message);
  //     return false;
  //   }
  // }

  // private async HandleApprovedPayment(order: Order) {
  //   if (order.status === OrderStatus.APPROVED) {
  //     this.logger.log(`Pedido ${order.id} já foi processado anteriormente`);
  //     return;
  //   }

  //   try {
  //     await this.ordersRepository.update(order.id, {
  //       status: OrderStatus.APPROVED,
  //       paidAt: new Date(),
  //     });

  //     this.logger.log(`✅ Pedido ${order.id} aprovado e estoque reduzido`);

  //     await this.emaillSerive.SendPaymentApprovedEmail(order, false);
  //     await this.emaillSerive.SendPaymentApprovedEmail(order, true);
  //   } catch (error) {
  //     this.logger.error(
  //       `Erro ao processar pedido aprovado ${order.id}:`,
  //       error,
  //     );
  //     throw error;
  //   }
  // }

  // private async HandleRejectedPayment(order: Order, status: string) {
  //   if (
  //     order.status === OrderStatus.REJECTED ||
  //     order.status === OrderStatus.CANCELED
  //   ) {
  //     this.logger.log(`Pedido ${order.id} já foi cancelado anteriormente`);
  //     return;
  //   }

  //   try {
  //     let newStatus: OrderStatus;

  //     if (status === 'rejected') {
  //       newStatus = OrderStatus.REJECTED;
  //     } else {
  //       newStatus = OrderStatus.CANCELED;
  //     }

  //     const updateOrderStatus = await this.ordersRepository.update(order.id, {
  //       status: newStatus,
  //     });

  //     if (!updateOrderStatus || updateOrderStatus.affected < 1) {
  //       throw new InternalServerErrorException(
  //         `Erro ao atualizar pedido ${order.id}`,
  //       );
  //     }

  //     for (const item of order.items) {
  //       const queryRunner = this.dataSource.createQueryRunner();
  //       await queryRunner.connect();
  //       await queryRunner.startTransaction();

  //       try {
  //         const findProduct = await queryRunner.manager.findOne(Product, {
  //           where: {
  //             id: item.product.id,
  //           },
  //           lock: { mode: 'pessimistic_write' },
  //         });

  //         if (!findProduct) {
  //           throw new NotFoundException(
  //             `Produto ${item.product_name} não encontrado para ser devolvido ao estoque`,
  //           );
  //         }

  //         const updatedProductQuantity = (findProduct.quantity +=
  //           item.quantity);

  //         const updateProductQuantity = await queryRunner.manager.update(
  //           Product,
  //           findProduct.id,
  //           {
  //             quantity: updatedProductQuantity,
  //           },
  //         );

  //         if (!updateProductQuantity || updateProductQuantity.affected < 1) {
  //           throw new InternalServerErrorException(
  //             `Erro ao tentar devolver unidades de produto ${item.product_name} ao estoque`,
  //           );
  //         }

  //         await queryRunner.commitTransaction();
  //       } catch (error) {
  //         await queryRunner.rollbackTransaction();
  //         throw error;
  //       } finally {
  //         await queryRunner.release();
  //       }
  //     }

  //     this.logger.log(`❌ Pedido ${order.id} ${newStatus} - estoque liberado`);

  //     await this.emaillSerive.SendPaymentRejectedEmail(order, false);
  //   } catch (error) {
  //     this.logger.error(
  //       `Erro ao processar pedido rejeitado ${order.id}:`,
  //       error,
  //     );
  //     throw error;
  //   }
  // }

  // private async HandlePendingPayment(order: Order) {
  //   if (order.status === OrderStatus.WAITING_PAYMENT) return;

  //   await this.ordersRepository.update(order.id, {
  //     status: OrderStatus.WAITING_PAYMENT,
  //   });

  //   this.logger.log(`⏳ Pedido ${order.id} aguardando pagamento`);
  // }

  // private async HandleInProcessPayment(order: Order): Promise<void> {
  //   if (order.status === OrderStatus.IN_PROCESS) return;

  //   await this.ordersRepository.update(order.id, {
  //     status: OrderStatus.IN_PROCESS,
  //   });

  //   // await this.emaillSerive.SendPaymentPendingEmail(order, false);

  //   this.logger.log(`🔄 Pedido ${order.id} em processamento`);
  // }
}
