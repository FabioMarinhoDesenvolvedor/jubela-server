import { forwardRef, Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from 'src/email/email.module';
import { Product } from 'src/products/entities/product.entity';
import { ProductsModule } from 'src/products/product.module';
import { UsersModule } from 'src/users/user.module';
import { Items } from './entities/items.entity';
import { Order } from './entities/order.entity';
import { PaymentConfirmation } from './entities/payment-confirmation.entity';
import { OrdersService } from './order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Items, Product, PaymentConfirmation]),
    forwardRef(() => UsersModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => EmailModule),
  ],
  providers: [OrdersService, Logger],
  exports: [
    TypeOrmModule.forFeature([Order, Items, PaymentConfirmation]),
    OrdersService,
  ],
})
export class OrdersModule {}
