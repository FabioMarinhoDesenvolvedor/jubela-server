import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { EmailService } from 'src/email/email.service';
import { Product } from 'src/products/entities/product.entity';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/user.service';
import { DataSource, In, QueryRunner, Repository } from 'typeorm';

import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { ErrorManagement } from 'src/utils/error.util';
import { CreateOrderItemDTO } from './dto/create-item.dto';
import { PaginationAllOrdersDTO } from './dto/pagination-all-orders.dto';
import { PaginationByPriceDTO } from './dto/pagination-by-price.dto';
import { PaginationByUserDTO } from './dto/pagination-by-user.dto';
import { PaginationByStatusDTO } from './dto/pagination-order-status.dto';
import { PaginationDTO } from './dto/pagination-order.dto';
import { Items } from './entities/items.entity';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,

    private readonly logger: Logger,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private dataSource: DataSource,
  ) {}

  async Create(
    createOrderItemDTO: CreateOrderItemDTO[],
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let findUser: User;
    let newOrderData: Order;
    let findProduct: Product;
    let sendEmail = false;
    const itemsFromThisOrder: Items[] = [];

    try {
      findUser = await queryRunner.manager.findOne(User, {
        where: {
          id: tokenPayloadDTO.sub,
        },
      });

      if (!findUser) {
        throw new NotFoundException('Usuário não encontrado');
      }

      const getTotalPrice = await this.PriceCalculate(
        createOrderItemDTO,
        queryRunner,
      );

      const orderData = {
        total_price: getTotalPrice,
        user: findUser,
        items: [],
        status: OrderStatus.PENDING,
        paidAt: null,
      };

      const orderCreate = queryRunner.manager.create(Order, orderData);

      newOrderData = await queryRunner.manager.save(orderCreate);

      for (let i = 0; i < createOrderItemDTO.length; i++) {
        findProduct = await queryRunner.manager.findOne(Product, {
          where: {
            id: createOrderItemDTO[i].product,
          },
          loadEagerRelations: false,
          lock: { mode: 'pessimistic_write' },
        });

        if (!findProduct) {
          throw new NotFoundException('Produto não encontrado');
        }

        const itemData = {
          product_name: createOrderItemDTO[i].product_name,
          quantity: createOrderItemDTO[i].quantity,
          price: findProduct.price,
          description: findProduct.description,
          order: newOrderData,
          product: findProduct,
        };

        const { quantity, lowStock } = findProduct;

        switch (true) {
          case quantity < 1:
            throw new BadRequestException(
              `Produto ${findProduct.name} esgotado`,
            );

          case createOrderItemDTO[i].quantity > quantity:
            throw new BadRequestException(
              `Estoque do produto  ${findProduct.name} insuficiente`,
            );

          case quantity <= lowStock &&
            quantity >= createOrderItemDTO[i].quantity:
            sendEmail = true;
            break;
        }

        const quantityUpdate =
          findProduct.quantity - createOrderItemDTO[i].quantity;

        const productQuantityUpdate = await queryRunner.manager.update(
          Product,
          findProduct.id,
          {
            quantity: quantityUpdate,
          },
        );

        if (!productQuantityUpdate || productQuantityUpdate.affected < 1) {
          throw new InternalServerErrorException(
            `Erro ao atualizar quantidade do produto ${createOrderItemDTO[i].product_name}`,
          );
        }

        const orderItemCreate = queryRunner.manager.create(Items, itemData);

        itemsFromThisOrder.push(orderItemCreate);
      }

      await queryRunner.manager.save(Items, itemsFromThisOrder);

      await queryRunner.commitTransaction();

      if (sendEmail === true) await this.emailService.LowStockWarn(findProduct);

      const createPreferenceObject =
        this.ReturnItemsIPObject(itemsFromThisOrder);

      return {
        orderId: newOrderData.id,
        items: createPreferenceObject,
        payer: {
          email: findUser.email,
          name: findUser.name,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao criar pedido e atualizar dados do produto',
        queryFailedError: 'Erro nas transações de dados do pedido',
        internalServerError: 'Erro ao processar o pedido',
        generalError:
          'Falha ao processar transação na criação de pedido e atualização de dados do produto',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async PriceCalculate(
    createOrderItemDTO: CreateOrderItemDTO[],
    queryRunner: QueryRunner,
  ) {
    const productsIds: string[] = createOrderItemDTO.map(
      (item) => item.product,
    );
    const findProducts = await queryRunner.manager.find(Product, {
      where: {
        id: In(productsIds as string[]),
      },
    });

    if (findProducts.length !== productsIds.length) {
      throw new NotFoundException('Um ou mais produtos não encontrados');
    }

    const productsMap = new Map(
      findProducts.map((product) => [product.id, product]),
    );

    let totalPrice = new Decimal(0);

    for (const item of createOrderItemDTO) {
      const product = productsMap.get(item.product);

      const price = new Decimal(product.price);

      totalPrice = totalPrice.add(price.mul(item.quantity));
    }

    const totalPriceCents = totalPrice.mul(100).toDecimalPlaces(0).toString();

    return totalPriceCents;
  }

  ReturnItemsIPObject(items: Items[]) {
    const itemsList = [];
    for (const item of items) {
      itemsList.push({
        quantity: item.quantity,
        price: item.price,
        description: item.description,
      });
    }

    return itemsList;
  }

  async FindById(id: string) {
    const orderFindById = await this.ordersRepository.findOne({
      where: {
        id,
      },
      relations: {
        items: true,
        user: true,
      },
    });

    if (!orderFindById) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return orderFindById;
  }

  async ListOrdersEmployees(paginationAllOrders?: PaginationAllOrdersDTO) {
    const { limit, offset } = paginationAllOrders;

    const [findAll, total] = await this.ordersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
    });

    return [total, ...findAll];
  }

  async ListOrdersUsers(tokenPayloadDTO: TokenPayloadDTO) {
    const findUser = await this.usersService.FindById(tokenPayloadDTO.sub);

    if (!findUser) {
      throw new UnauthorizedException('Ação não permitida');
    }

    const [findAll, total] = await this.ordersRepository.findAndCount({
      where: {
        user: findUser,
      },
      order: {
        id: 'desc',
      },
    });

    return [total, ...findAll];
  }

  async FindByPriceEmployees(paginationByPriceDTO: PaginationByPriceDTO) {
    const { limit, offset, value } = paginationByPriceDTO;

    const [orderFindByName, total] = await this.ordersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
      where: {
        total_price: value,
      },
    });

    if (!orderFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por pedidos',
      );
    }

    if (orderFindByName.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orderFindByName];
  }

  async FindByPriceUsers(
    paginationByPriceDTO: PaginationByPriceDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const findUser = await this.usersService.FindById(tokenPayloadDTO.sub);

    if (!findUser) {
      throw new UnauthorizedException('Ação não permitida');
    }

    const { limit, offset, value } = paginationByPriceDTO;

    const [orderFindByName, total] = await this.ordersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
      where: {
        total_price: value,
        user: findUser,
      },
    });

    if (!orderFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por pedidos',
      );
    }

    if (orderFindByName.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orderFindByName];
  }

  async FindByItemEmployees(paginationDTO: PaginationDTO) {
    const { limit, offset, value } = paginationDTO;

    const [orderFindByName, total] = await this.ordersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
      where: {
        items: {
          product_name: value,
        },
      },
    });

    if (!orderFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por pedidos',
      );
    }

    if (orderFindByName.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orderFindByName];
  }

  async FindByItemUsers(
    paginationDTO: PaginationDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const findUser = await this.usersService.FindById(tokenPayloadDTO.sub);

    if (!findUser) {
      throw new UnauthorizedException('Ação não permitida');
    }

    const { limit, offset, value } = paginationDTO;

    const [orderFindByName, total] = await this.ordersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
      where: {
        items: {
          product_name: value,
        },
        user: findUser,
      },
    });

    if (!orderFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por pedidos',
      );
    }

    if (orderFindByName.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orderFindByName];
  }

  async FindByStatus(paginationByStatusDTO: PaginationByStatusDTO) {
    const { limit, offset, value } = paginationByStatusDTO;

    const [orderFindByStatus, total] = await this.ordersRepository.findAndCount(
      {
        take: limit,
        skip: offset,
        order: {
          id: 'desc',
        },
        where: {
          status: value,
        },
      },
    );

    if (!orderFindByStatus) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por pedidos',
      );
    }

    if (orderFindByStatus.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orderFindByStatus];
  }

  async FindByUser(paginationByUserDTO: PaginationByUserDTO) {
    const { limit, offset, value } = paginationByUserDTO;

    const [orderFindByUser, total] = await this.ordersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
      where: {
        user: {
          id: value,
        },
      },
      relations: {
        user: true,
      },
      select: {
        user: {
          id: true,
          name: true,
          email: true,
        },
      },
    });

    if (!orderFindByUser) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por pedidos',
      );
    }

    if (orderFindByUser.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orderFindByUser];
  }
}
