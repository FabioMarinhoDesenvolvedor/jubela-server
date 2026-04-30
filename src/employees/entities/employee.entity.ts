import { IsEmail, IsString } from 'class-validator';
import { EmployeeRole } from 'src/common/enums/employee-role.enum';
import { EmployeeSituation } from 'src/common/enums/employee-situation.enum';
import { Product } from 'src/products/entities/product.entity';
import { RefreshTokenEmployee } from 'src/refresh-tokens/entities/refresh-token-employee.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 14, unique: true })
  @IsString()
  cpf: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @IsEmail()
  email: string;

  @Column({ type: 'varchar', length: 125 })
  @IsString()
  name: string;

  @Column({ type: 'varchar', length: 255 })
  @IsString()
  password_hash: string;

  @Column({
    type: 'enum',
    enum: EmployeeRole,
    array: true,
  })
  role: EmployeeRole[];

  @Column({
    type: 'enum',
    enum: EmployeeSituation,
    default: EmployeeSituation.EMPLOYED,
  })
  situation: EmployeeSituation;

  @OneToMany(() => Product, (product) => product.employee)
  products: Product[];

  @OneToMany(() => RefreshTokenEmployee, (token) => token.employee)
  refresh_tokens: RefreshTokenEmployee[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
