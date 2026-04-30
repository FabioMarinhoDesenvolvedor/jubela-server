import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { PaymentStatus } from 'src/common/enums/payment-status.enum';
import { PaymentConfirmation } from 'src/orders/entities/payment-confirmation.entity';
import { ErrorManagement } from 'src/utils/error.util';
import { DataSource, QueryFailedError, QueryRunner, Repository } from 'typeorm';
import { TokenPayloadDTO } from '../auth/dto/token-payload.dto';
import { OrderStatus } from '../common/enums/order-status.enum';
import { EmailService } from '../email/email.service';
import { Items } from '../orders/entities/items.entity';
import { Order } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/order.service';
import { Product } from '../products/entities/product.entity';
import { GetErrorMessage } from '../utils/error-message.util';
import { CronJobOrgService } from './cron-job-org.service';
import { CancelDTO } from './dto/cancel.dto';
import { CreateCheckoutDto } from './dto/create-preference.dto';
import { OrderDTO } from './dto/order.dto';
import { PartialRefundDTO } from './dto/partial-refund.dto';
import { PartialRefundItemDTO } from './dto/refund-item.dto';
import { RefundDTO } from './dto/refund.dto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly RETRY_DELAYS = [2, 8, 20, 30];

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,

    @InjectRepository(PaymentConfirmation)
    private readonly paymentConfirmationRepository: Repository<PaymentConfirmation>,
    private readonly ordersService: OrdersService,
    private readonly emailsService: EmailService,
    private readonly cronJobOrgService: CronJobOrgService,
    private dataSource: DataSource,
  ) {}

  async RefundOrder(
    orderId: string,
    refundDTO: RefundDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const findOrder = await this.ordersService.FindById(orderId);

    if (
      findOrder.user.id !== tokenPayloadDTO.sub &&
      !tokenPayloadDTO.role?.includes('admin')
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para estornar pedidos',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doesOrderReallyExists = await queryRunner.manager.findOne(Order, {
        where: {
          id: orderId,
        },
        relations: {
          items: true,
        },
        select: {
          items: {
            product: true,
          },
        },
      });

      if (!doesOrderReallyExists) {
        throw new NotFoundException(`Pedido ${orderId} não encontrado`);
      }

      for (const item of doesOrderReallyExists.items) {
        const findProduct = await queryRunner.manager.findOne(Product, {
          where: {
            id: item.product.id,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (!findProduct) {
          throw new NotFoundException(
            `Produto ${item.product_name} não encontrado para ser devolvido ao estoque`,
          );
        }

        const updatedProductQuantity = (findProduct.quantity += item.quantity);

        const updateProductQuantity = await queryRunner.manager.update(
          Product,
          findProduct.id,
          {
            quantity: updatedProductQuantity,
          },
        );

        if (!updateProductQuantity || updateProductQuantity.affected < 1) {
          throw new InternalServerErrorException(
            `Erro ao tentar devolver unidades de produto ${item.product_name} ao estoque`,
          );
        }
      }

      await queryRunner.manager.update(Order, orderId, {
        status: OrderStatus.REFUNDED,
        refundedAt: new Date(),
        refundReason: refundDTO.reasonCode,
      });

      await queryRunner.commitTransaction();

      this.logger.log(`✅ Devolução total processada: Order ${orderId}`);

      // amount
      // função completa com switch e if para variações (DRY)
      const returnObject = {
        amount: 0,
        orderId,
      };

      this.emailsService.SendRefundProcessedEmail(findOrder, false);
      this.emailsService.SendRefundProcessedEmail(findOrder, true);

      return returnObject;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const manageError = GetErrorMessage(error);

      this.logger.error(
        `Erro na devolução: ${manageError}`,
        error instanceof Error ? error.stack : null,
      );

      if (error instanceof QueryFailedError) {
        throw new InternalServerErrorException(
          'Erro na atualização dos dados da devolução',
        );
      }

      if (error instanceof HttpException) {
        const status = error.getStatus();

        if (status >= 500) {
          throw new InternalServerErrorException(
            'Erro interno ao processar devolução',
          );
        }

        throw error;
      }

      throw new InternalServerErrorException('Erro ao processar devolução');
    } finally {
      await queryRunner.release();
    }
  }

  async RefundOrderPartial(
    orderId: string,
    partialRefundDTO: PartialRefundDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const findOrder = await this.ordersService.FindById(orderId);

    if (
      findOrder.user.id !== tokenPayloadDTO.sub &&
      !tokenPayloadDTO.role?.includes('admin')
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para estornar este pedido',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doesOrderReallyExists = await queryRunner.manager.findOne(Order, {
        where: {
          id: orderId,
        },
        relations: {
          items: true,
        },
        select: {
          items: {
            product: true,
          },
        },
      });

      if (!doesOrderReallyExists) {
        throw new NotFoundException('Pedido não encontrado');
      }

      const refundDetails = await this.ValidateAndCalculateRefund(
        doesOrderReallyExists,
        partialRefundDTO.items,
        queryRunner,
      );

      for (const item of partialRefundDTO.items) {
        const findProduct = await queryRunner.manager.findOne(Product, {
          where: {
            id: item.productId,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (!findProduct) {
          throw new NotFoundException(
            `Produto ${item.product_name} não encontrado para ser devolvido ao estoque`,
          );
        }

        const updatedProductQuantity = (findProduct.quantity += item.quantity);

        const updateProductQuantity = await queryRunner.manager.update(
          Product,
          findProduct.id,
          {
            quantity: updatedProductQuantity,
          },
        );

        if (!updateProductQuantity || updateProductQuantity.affected < 1) {
          throw new InternalServerErrorException(
            `Erro ao tentar devolver unidades de produto ${item.product_name} ao estoque`,
          );
        }
      }

      const refundTotal = new Decimal(doesOrderReallyExists.refundAmount);
      const totalAmount = new Decimal(refundDetails.totalAmount);

      const compare = refundTotal.greaterThan(totalAmount);

      if (compare !== true) {
        await queryRunner.manager.update(Order, doesOrderReallyExists.id, {
          status: OrderStatus.REFUNDED,
          refundAmount: totalAmount.toString(),
        });
      } else {
        const sumValues = refundTotal.add(totalAmount);

        await queryRunner.manager.update(Order, doesOrderReallyExists.id, {
          status: OrderStatus.PARTIAL_REFUND,
          refundAmount: sumValues.toString(),
        });
      }

      await queryRunner.commitTransaction();

      const returnObject = {
        amount: totalAmount.toNumber(),
        orderId,
        itemsRefunded: refundDetails.items.length,
        details: refundDetails.items.map((item) => {
          const items = {
            productName: item.item.product_name,
            quantity: item.item.quantity,
            amount: item.amount,
          };

          return items;
        }),
      };

      this.emailsService.SendPartialRefundEmail(
        findOrder,
        returnObject.amount,
        false,
        returnObject.details,
      );

      this.emailsService.SendPartialRefundEmail(
        findOrder,
        returnObject.amount,
        true,
        returnObject.details,
      );

      this.logger.log(
        `✅ Estorno parcial processado: Pedido ${orderId} - Total R$ ${refundDetails.totalAmount}`,
      );

      return returnObject;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const manageError = GetErrorMessage(error);

      this.logger.error(`Erro na devolução parcial: ${manageError}`);

      if (error instanceof QueryFailedError) {
        throw new InternalServerErrorException(
          'Erro nas atualizações de dados de devolução parcial',
        );
      }

      if (error instanceof HttpException) {
        const status = error.getStatus();

        if (status >= 500) {
          throw new InternalServerErrorException(
            'Erro interno ao processar devolução parcial',
          );
        }

        throw error;
      }

      throw new InternalServerErrorException(
        'Erro ao processar devolução parcial',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async ValidateAndCalculateRefund(
    order: Order,
    refundItems: PartialRefundItemDTO[],
    queryRunner: QueryRunner,
  ) {
    const refundDetails = {
      totalAmount: new Decimal(0),
      items: [] as Array<{
        item: Items;
        quantity: number;
        amount: number;
      }>,
    };

    for (const refundItem of refundItems) {
      const orderItem = await queryRunner.manager.findOne(Items, {
        where: {
          id: refundItem.orderItemId,
          order: { id: order.id }, // Garantir que pertence a este pedido
        },
        relations: {
          product: true,
        },
      });

      if (!orderItem) {
        throw new NotFoundException(
          `Item ${refundItem.product_name}, de id ${refundItem.orderItemId} do pedido ${order.id} não encontrado`,
        );
      }

      if (refundItem.quantity > orderItem.quantity) {
        throw new BadRequestException(
          `Quantidade de devolução (${refundItem.quantity}) ` +
            `maior que quantidade comprada (${orderItem.quantity}) ` +
            `para produto ${orderItem.product.name}`,
        );
      }

      const itemPrice = new Decimal(orderItem.price);
      const itemRefundAmount = itemPrice.mul(refundItem.quantity);

      refundDetails.items.push({
        item: orderItem,
        quantity: refundItem.quantity,
        amount: itemRefundAmount.toNumber(),
      });

      refundDetails.totalAmount =
        refundDetails.totalAmount.add(itemRefundAmount);
    }

    return {
      totalAmount: refundDetails.totalAmount.toNumber(),
      items: refundDetails.items,
    };
  }

  async CancelOrder(
    orderId: string,
    cancelDTO: CancelDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const findOrder = await this.ordersService.FindById(orderId);
    const returnObject = {
      orderId,
      status: 'cancelled',
      message: 'Pedido cancelado com sucesso',
    };

    if (
      findOrder.user.id !== tokenPayloadDTO.sub &&
      !tokenPayloadDTO.role?.includes('admin')
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para estornar este pedido',
      );
    }

    if (
      findOrder.status !== OrderStatus.WAITING_PAYMENT &&
      findOrder.status !== OrderStatus.IN_PROCESS
    ) {
      throw new BadRequestException(
        'Só é possível cancelar pagamentos pendentes ou em processo',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doesOrderReallyExists = await queryRunner.manager.findOne(Order, {
        where: {
          id: orderId,
        },
        relations: {
          items: true,
        },
        select: {
          items: {
            product: true,
          },
        },
      });

      if (!doesOrderReallyExists) {
        throw new NotFoundException('Pedido não encontrado');
      }

      // await this.paymentClient.cancel({
      //   id: doesOrderReallyExists.paymentId,
      // });

      for (const item of doesOrderReallyExists.items) {
        const findProduct = await queryRunner.manager.findOne(Product, {
          where: {
            id: item.product.id,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (!findProduct) {
          throw new NotFoundException(
            `Produto ${item.product_name} não encontrado para ser devolvido ao estoque`,
          );
        }

        const updatedProductQuantity = (findProduct.quantity += item.quantity);

        const updateProductQuantity = await queryRunner.manager.update(
          Product,
          findProduct.id,
          {
            quantity: updatedProductQuantity,
          },
        );

        if (!updateProductQuantity || updateProductQuantity.affected < 1) {
          throw new InternalServerErrorException(
            `Erro ao tentar devolver unidades de produto ${item.product_name} ao estoque`,
          );
        }
      }

      await queryRunner.manager.update(Order, orderId, {
        status: OrderStatus.CANCELED,
        cancelReason: cancelDTO.reason,
        canceledAt: new Date(),
      });

      // await this.emailsService.SendOrderCanceledEmail(
      //   findOrder,
      //   false,
      //   cancelDTO.reason,
      // );

      this.logger.log(`✅ Pedido cancelado: ${orderId}`);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const manageError = GetErrorMessage(error);

      this.logger.error(`Erro ao cancelar pedido: ${manageError}`);

      if (error instanceof QueryFailedError) {
        throw new InternalServerErrorException(
          'Erro ao atualizar dados do pedido cancelado',
        );
      }

      if (error instanceof HttpException) {
        const status = error.getStatus();

        if (status >= 500) {
          throw new InternalServerErrorException(
            'Erro interno ao cancelar pedido',
          );
        }

        throw error;
      }

      throw new InternalServerErrorException('Erro ao cancelar pedido');
    } finally {
      await queryRunner.release();
    }

    return returnObject;
  }

  // private ValidateRefundEligibility(order: Order) {
  //   if (order.status !== OrderStatus.APPROVED) {
  //     throw new BadRequestException('Só é possível estornar pedidos aprovados');
  //   }

  //   const daysSincePaid = Math.floor(
  //     (Date.now() - order.paidAt.getTime()) / (1000 * 60 * 60 * 24),
  //   );

  //   if (daysSincePaid > 180) {
  //     throw new BadRequestException(
  //       'Prazo para estorno expirado (máximo 180 dias)',
  //     );
  //   }
  // }

  async CheckPaymentStatus(orderId: string): Promise<void> {
    const confirmation = await this.paymentConfirmationRepository.findOne({
      where: {
        order: {
          id: orderId,
        },
      },
      relations: {
        order: true,
      },
    });

    if (!confirmation) {
      this.logger.warn(
        `Confirmação de pagamento do pedido ${orderId} não encontrada`,
      );
    }

    if (confirmation?.jobId) {
      await this.cronJobOrgService.DeleteJob(confirmation.jobId).catch(() => {
        this.logger.warn(`Não foi possível deletar job ${confirmation.jobId}`);
      });
    }

    const order = await this.ordersRepository.findOne({
      where: {
        id: orderId,
      },
    });

    if (order?.status === OrderStatus.APPROVED) {
      await this.paymentConfirmationRepository.update(confirmation.id, {
        paymentStatus: PaymentStatus.CONFIRMED,
        processedAt: new Date(),
        jobId: null,
      });

      this.logger.log(`✅ Check confirmou pagamento do pedido ${orderId}`);
      return;
    }

    const nextAttempt = (confirmation?.attempts ?? 0) + 1;

    // Esgotou tentativas (passou de 1 hora)
    if (nextAttempt > this.RETRY_DELAYS.length) {
      await this.paymentConfirmationRepository.update(confirmation.id, {
        paymentStatus: PaymentStatus.FAILED,
        errorMessage: 'Pagamento não confirmado após 1 hora',
        jobId: null,
      });

      this.logger.warn(
        `⚠️ Pedido ${orderId} sem confirmação após todos os checks`,
      );

      // Notifica admin?
      // Notificar cliente a cada cron ou só no final?
      // await this.emailsService.SendPaymentNotConfirmedEmail(order);
      await this.ordersService.StockRelease(order);
      return;
    }

    // Agenda próximo check
    await this.SchedulePaymentCheck(orderId, nextAttempt);

    this.logger.log(
      `🔄 Pedido ${orderId} ainda pendente — próximo check em ${this.RETRY_DELAYS[nextAttempt - 1]}min`,
    );
  }

  async SchedulePaymentCheck(orderId: string, attempt: number) {
    const delayInMinutes = this.RETRY_DELAYS[attempt - 1];

    if (!delayInMinutes) return;

    const url = `${process.env.URL_RENDER}/checkout/payment-check/${orderId}`;

    const jobId = await this.cronJobOrgService.UniqueJobSchedule(
      `First job - order ${orderId}`,
      delayInMinutes,
      url,
    );

    await this.paymentConfirmationRepository.upsert(
      {
        order: { id: orderId },
        jobId,
        attempts: attempt,
        paymentStatus: PaymentStatus.PENDING,
      },
      ['order'],
    );
  }

  async CreateCheckout(orderDTO: OrderDTO, tokenPayloadDTO: TokenPayloadDTO) {
    try {
      const { orderItems } = orderDTO;

      const createOrder = await this.ordersService.Create(
        orderItems,
        tokenPayloadDTO,
      );

      const ipData: CreateCheckoutDto = {
        handle: 'tag',
        redirect_url: 'url',
        order_nsu: createOrder.orderId,
        customer: {
          name: createOrder.payer.name,
          email: createOrder.payer.email,
        },
        items: [...createOrder.items],
      };

      const res = await fetch(
        'https://api.infinitepay.io/invoices/public/checkout/links',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ipData),
        },
      );

      // Verficar errorData se não expõe nenhum dado sensível
      if (!res.ok) {
        const errorData = await res.json();

        throw new HttpException(
          errorData.message || 'Erro na transação',
          res.status,
        );
      }

      const response = await res.json();

      const addCheckoutUrl = await this.ordersRepository.update(
        createOrder.orderId,
        {
          checkoutUrl: response,
        },
      );

      if (!addCheckoutUrl || addCheckoutUrl.affected === 0) {
        throw new InternalServerErrorException(
          'Erro ao atualizar dados de pedido',
        );
      }

      await this.SchedulePaymentCheck(createOrder.orderId, 1);

      return response;
    } catch (error) {
      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro no checkout:',
        queryFailedError: 'Erro ao criar registros do checkout',
        internalServerError: 'Erro interno ao criar checkout',
        generalError: 'Erro ao criar checkout',
      });
    }
  }

  async ProcessPaymentNotification(paymentId: string, orderNsu: string) {
    try {
      const isOrderAlreadyPaid = await this.ordersRepository.findOne({
        where: {
          paymentId,
        },
      });

      if (isOrderAlreadyPaid) return 'ok';

      let order: Order;

      await this.dataSource.transaction(async (manager) => {
        order = await manager.findOne(Order, {
          where: {
            id: orderNsu,
          },
          relations: {
            items: true,
          },
          select: {
            items: {
              product: true,
            },
          },
        });

        if (!order) {
          throw new NotFoundException(
            `Pedido ${orderNsu} não encontrado. Webhook`,
          );
        }

        const updateOrder = await manager.update(Order, order.id, {
          paymentId: paymentId,
          status: OrderStatus.APPROVED,
          paidAt: new Date(),
        });

        if (!updateOrder || updateOrder.affected === 0) {
          throw new InternalServerErrorException(
            'Erro ao adicionar id de pagamento ao pedido',
          );
        }
      });

      this.logger.log(`✅ Pedido ${orderNsu} aprovado e estoque reduzido`);

      await this.emailsService.SendPaymentApprovedEmail(order, false);
      await this.emailsService.SendPaymentApprovedEmail(order, true);

      return 'Pedido processado';
    } catch (error) {
      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao processar notificação de pagamento:',
        queryFailedError: 'Erro ao atualizar dados do pedido',
        internalServerError:
          'Erro interno ao processar notificação de pagamento',
        generalError: 'Erro ao processar notificação de pagamento',
      });
    }
  }
}
