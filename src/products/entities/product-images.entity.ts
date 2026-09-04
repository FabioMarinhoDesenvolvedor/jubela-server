import { Type } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity({ name: 'product_images' })
export class ProductImages {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  url: string;

  @Column({ type: 'varchar', length: 120 })
  publicId: string;

  @Column({ default: false })
  isMain: boolean; // Marca a imagem principal

  @Column({ nullable: true })
  order: number; // Ordem de exibição

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @Type(() => Product)
  product: Product;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
