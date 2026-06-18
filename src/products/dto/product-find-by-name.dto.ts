import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ProductFindByNameDTO {
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
}
