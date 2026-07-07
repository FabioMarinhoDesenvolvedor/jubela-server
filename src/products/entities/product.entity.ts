import { Employee } from 'src/employees/entities/employee.entity';
import { Items } from 'src/orders/entities/items.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductImages } from './product-images.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  category: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: string;

  // Preço promocional. Null = sem promoção. Quando definido, deve ser menor
  // que `price` (regra validada no service). O produto é considerado "em
  // promoção" enquanto promoPrice existir e promoEndsAt (se houver) for futuro.
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  promoPrice: string | null;

  // Fim da promoção (opcional). Null = sem data de expiração.
  @Column({ type: 'timestamptz', nullable: true })
  promoEndsAt: Date | null;

  @OneToMany(() => ProductImages, (image) => image.product, {
    cascade: true,
    eager: true,
  })
  images: ProductImages[];

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', nullable: true })
  lowStock: number;

  @Column({ type: 'varchar', length: 255 })
  sku: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  employee: Employee;

  @OneToMany(() => Items, (orderItem) => orderItem.product)
  orderItem: Items[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
