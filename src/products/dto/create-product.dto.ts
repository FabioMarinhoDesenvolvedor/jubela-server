import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';
import { IsDecimalString } from 'src/common/decoratos/decimal-string.decorator';

export class CreateProductDTO {
  @IsNotEmpty({
    message: 'Campo "nome" não preenchido',
  })
  @IsString({
    message: 'O campo "nome" deve estar no formato de texto',
  })
  @Length(0, 100, {
    message: 'O campo "nome" deve ter o comprimento máximo de 100',
  })
  readonly name: string;

  @IsNotEmpty({
    message: 'Campo "categoria" não preenchido',
  })
  @IsString({
    message: 'O campo "categoria" deve estar no formato de texto',
  })
  @Length(0, 60, {
    message: 'O campo "categoria" deve ter o comprimento máximo de 60',
  })
  readonly category: string;

  @IsNotEmpty({
    message: 'Campo "descrição" não preenchido',
  })
  @IsString({
    message: 'O campo "descrição" deve estar no formato de texto',
  })
  @Length(10, 600, {
    message: 'O campo descrição deve ter o comprimento máximo de 600',
  })
  readonly description: string;

  @IsNotEmpty({
    message: 'Campo "preço" não preenchido',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.trim(); // Remove espaços em branco
    }
    return value;
  })
  @IsDecimalString({
    message: 'O campo preco deve ser um string decima ex: 59.99',
  })
  readonly price: string;

  @IsNotEmpty({
    message: 'Campo "quantidade" não preenchido',
  })
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({
    message: 'Campo "quantidade" deve ser um número inteiro positivo',
  })
  @IsPositive({
    message: 'Campo "quantidade" deve ser um número inteiro positivo',
  })
  readonly quantity: number;

  @IsOptional()
  @IsInt({
    message: 'Campo "quantidade mínima" deve ser um número inteiro positivo',
  })
  @Transform(({ value }) => parseInt(value, 10))
  @IsPositive({
    message: 'Campo "quantidade mínima" deve ser um número inteiro positivo',
  })
  readonly lowStock?: number;

  @IsNotEmpty({
    message: 'Campo "sku" não preenchido',
  })
  @IsString({
    message: 'O campo "sku" deve estar em formato de texto',
  })
  readonly sku: string;
}
