import { Type } from 'class-transformer';
import { Product } from 'src/products/entities/product.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity()
export class Items {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  product_name: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'order' })
  @Type(() => Order)
  order: Order;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'product' })
  @Type(() => Product)
  product: Product;
}
