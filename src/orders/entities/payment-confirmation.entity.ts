import { Type } from 'class-transformer';
import { PaymentStatus } from 'src/common/enums/payment-status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity()
export class PaymentConfirmation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    name: 'payment_status',
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'integer' })
  jobId: number;

  @Column({ type: 'varchar', length: 200, name: 'error_message' })
  errorMessage: string;

  @OneToOne(() => Order, (order) => order.paymentConfirmation, {
    onDelete: 'RESTRICT',
    nullable: true,
    cascade: true,
  })
  @JoinColumn()
  @Type(() => Order)
  order: Order;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date;
}
