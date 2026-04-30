import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  Length,
} from 'class-validator';
import { EmployeeRole } from 'src/common/enums/employee-role.enum';
import { EmployeeSituation } from 'src/common/enums/employee-situation.enum';
import { Product } from 'src/products/entities/product.entity';

export class CreateEmployeeDTO {
  @IsNotEmpty({
    message: 'campo "email" não preenchido',
  })
  @IsString({
    message: 'campo "email" deve estar em formato de texto',
  })
  @IsEmail()
  @Length(13, 50, {
    message: 'O campo "email" deve ter no mínimo 13 e no máximo 50 caracteres',
  })
  readonly email: string;

  @IsNotEmpty({
    message: 'campo "nome" não preenchido',
  })
  @IsString({
    message: 'campo "nome" deve estar em formato de texto',
  })
  @Length(0, 125, {
    message: 'campo "nome" deve ter no máximo 125 caracteres',
  })
  readonly name: string;

  @IsNotEmpty()
  @IsString()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 2,
    minNumbers: 2,
    minSymbols: 2,
    minUppercase: 2,
  })
  readonly password: string;

  @IsNotEmpty({
    message: 'campo "função" não preenchido',
  })
  @IsEnum(EmployeeRole, {
    message: 'Permissão inválida',
    each: true,
  })
  readonly role: EmployeeRole[];

  @IsNotEmpty({
    message: 'campo "situação" não preenchido',
  })
  @IsEnum(EmployeeSituation, {
    message: 'Situação do funcionário inválida',
  })
  readonly situation: EmployeeSituation;

  @IsOptional()
  readonly products: Product[];
}
