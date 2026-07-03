import {
  Injectable,
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
import {
  DataSource,
  FindManyOptions,
  In,
  QueryRunner,
  Repository,
} from 'typeorm';

import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { errorManagement } from 'src/utils/error.util';
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

  async create(
    createOrderItemDTO: CreateOrderItemDTO[],
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let findUser: User;
    let newOrderData: Order;
    let findProduct: Product;
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

      const getTotalPrice = await this.priceCalculate(
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

        // Estoque não é verificado nem descontado: a loja vende sob demanda.
        const orderItemCreate = queryRunner.manager.create(Items, itemData);

        itemsFromThisOrder.push(orderItemCreate);
      }

      await queryRunner.manager.save(Items, itemsFromThisOrder);

      await queryRunner.commitTransaction();

      const createPreferenceObject =
        this.returnItemsIPObject(itemsFromThisOrder);

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

      errorManagement(error, GeneralErrorType.INTERNAL, {
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

  async priceCalculate(
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

  returnItemsIPObject(items: Items[]) {
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

  async findById(id: string) {
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

  async listOrdersEmployees(paginationAllOrders?: PaginationAllOrdersDTO) {
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

  async listOrdersUsers(tokenPayloadDTO: TokenPayloadDTO) {
    const user = await this.requireUser(tokenPayloadDTO.sub);

    const [findAll, total] = await this.ordersRepository.findAndCount({
      where: { user },
      order: { id: 'desc' },
    });

    return [total, ...findAll];
  }

  async findByPriceEmployees(paginationByPriceDTO: PaginationByPriceDTO) {
    const { limit, offset, value } = paginationByPriceDTO;

    return this.searchOrders({
      take: limit,
      skip: offset,
      order: { id: 'desc' },
      where: { total_price: value },
    });
  }

  async findByPriceUsers(
    paginationByPriceDTO: PaginationByPriceDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const user = await this.requireUser(tokenPayloadDTO.sub);
    const { limit, offset, value } = paginationByPriceDTO;

    return this.searchOrders({
      take: limit,
      skip: offset,
      order: { id: 'desc' },
      where: { total_price: value, user },
    });
  }

  async findByItemEmployees(paginationDTO: PaginationDTO) {
    const { limit, offset, value } = paginationDTO;

    return this.searchOrders({
      take: limit,
      skip: offset,
      order: { id: 'desc' },
      where: { items: { product_name: value } },
    });
  }

  async findByItemUsers(
    paginationDTO: PaginationDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const user = await this.requireUser(tokenPayloadDTO.sub);
    const { limit, offset, value } = paginationDTO;

    return this.searchOrders({
      take: limit,
      skip: offset,
      order: { id: 'desc' },
      where: { items: { product_name: value }, user },
    });
  }

  async findByStatus(paginationByStatusDTO: PaginationByStatusDTO) {
    const { limit, offset, value } = paginationByStatusDTO;

    return this.searchOrders({
      take: limit,
      skip: offset,
      order: { id: 'desc' },
      where: { status: value },
    });
  }

  async findByUser(paginationByUserDTO: PaginationByUserDTO) {
    const { limit, offset, value } = paginationByUserDTO;

    return this.searchOrders({
      take: limit,
      skip: offset,
      order: { id: 'desc' },
      where: { user: { id: value } },
      relations: { user: true },
      select: { user: { id: true, name: true, email: true } },
    });
  }

  private async requireUser(sub: string) {
    const user = await this.usersService.findById(sub);

    if (!user) {
      throw new UnauthorizedException('Ação não permitida');
    }

    return user;
  }

  private async searchOrders(options: FindManyOptions<Order>) {
    const [orders, total] = await this.ordersRepository.findAndCount(options);

    if (orders.length < 1) {
      throw new NotFoundException('Pedidos não encontrados');
    }

    return [total, ...orders];
  }
}
