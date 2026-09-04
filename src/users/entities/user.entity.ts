import { Exclude, Type } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';
import { Order } from 'src/orders/entities/order.entity';
import { RefreshTokenUser } from 'src/refresh-tokens/entities/refresh-token-user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResetPassword } from './reset-password.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @IsEmail()
  email: string;

  @Column({ type: 'varchar', length: 125 })
  @IsString()
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsString()
  @Exclude()
  password_hash: string;

  // Este campo pode ser nulo porque o cliente pode criar uma conta e não comprar nada, ao menos inicialmente
  @OneToMany(() => Order, (order) => order.user)
  @Type(() => Order)
  order_history: Order[];

  @OneToMany(() => RefreshTokenUser, (token) => token.user)
  @Type(() => RefreshTokenUser)
  refresh_tokens: RefreshTokenUser[];

  @OneToMany(() => ResetPassword, (resetPassword) => resetPassword.user)
  @Type(() => ResetPassword)
  reset_passeword_attempts: ResetPassword[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
