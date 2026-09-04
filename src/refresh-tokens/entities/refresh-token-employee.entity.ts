import { Type } from 'class-transformer';
import { Employee } from 'src/employees/entities/employee.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class RefreshTokenEmployee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Generated('uuid')
  token_id: string;

  @Column({ type: 'boolean', default: false })
  is_valid: boolean;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @Type(() => Employee)
  employee: Employee;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
