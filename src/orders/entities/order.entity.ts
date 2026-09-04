import { Type } from 'class-transformer';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { RefundReason } from 'src/common/enums/refund-reason.enum';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Items } from './items.entity';
import { PaymentConfirmation } from './payment-confirmation.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  total_price: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @Type(() => User)
  user: User;

  @OneToMany(() => Items, (item) => item.order)
  @Type(() => Items)
  items: Items[];

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: RefundReason,
    name: 'refund_reason_code',
    nullable: true,
  })
  refundReasonCode: RefundReason;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'refund_reason',
  })
  refundReason: string;

  @Column({ type: 'timestamp', nullable: true, name: 'paid_at' })
  paidAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'refunded_at' })
  refundedAt: Date;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    name: 'refund_amount',
    nullable: true,
  })
  refundAmount: string;

  @Column({ type: 'timestamp', nullable: true, name: 'canceled_at' })
  canceledAt: Date;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'cancel_reason',
  })
  cancelReason: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentId: string;

  @OneToOne(() => PaymentConfirmation, (pc) => pc.order, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn()
  @Type(() => PaymentConfirmation)
  paymentConfirmation: PaymentConfirmation;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'checkout_url',
    nullable: true,
  })
  checkoutUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
