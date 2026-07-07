import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { HashingServiceProtocol } from 'src/auth/hashing/hashing.service';
import { PaginationByNameDTO } from 'src/common/dto/pagination-name.dto';
import { EmployeeRole } from 'src/common/enums/employee-role.enum';
import { EmployeeSituation } from 'src/common/enums/employee-situation.enum';
import { Like, Repository } from 'typeorm';
import { UrlUuidDTO } from '../common/dto/url-uuid.dto';
import { CreateEmployeeDTO } from './dto/create-employee.dto';
import { PaginationByRoleDTO } from './dto/pagination-employee-role.dto';
import { UpdateEmployeeAdminDTO } from './dto/update-employee-admin.dto';
import { UpdateEmployeeDTO } from './dto/update-employee.dto';
import { Employee } from './entities/employee.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly hashingService: HashingServiceProtocol,
  ) {}

  async create(createEmployeeDTO: CreateEmployeeDTO) {
    const password_hash = await this.hashingService.hash(
      createEmployeeDTO.password,
    );

    const employeeCreateData = {
      email: createEmployeeDTO.email,
      name: createEmployeeDTO.name,
      password_hash,
      role: createEmployeeDTO.role,
      situation: createEmployeeDTO.situation,
    };

    const employeeCreate = this.employeeRepository.create(employeeCreateData);

    const newEmployee = await this.employeeRepository.save(employeeCreate);

    if (!newEmployee) {
      throw new InternalServerErrorException(
        'Erro ao criar conta de funcionário',
      );
    }

    const allowedData = {
      id: newEmployee.id,
      email: newEmployee.email,
      name: newEmployee.name,
      role: newEmployee.role,
    };

    return {
      ...allowedData,
    };
  }

  async updateSelf(
    employeeIdDTO: UrlUuidDTO,
    updateEmployeeDTO: UpdateEmployeeDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const id = employeeIdDTO.id;

    const allowedData = {
      email: updateEmployeeDTO.email,
      name: updateEmployeeDTO.name,
      password_hash: updateEmployeeDTO.password,
    };

    if (id !== tokenPayloadDTO.sub) {
      throw new ForbiddenException('Ação não permitida');
    }

    if (updateEmployeeDTO?.password) {
      const passwordHash = await this.hashingService.hash(
        updateEmployeeDTO.password,
      );

      allowedData.password_hash = passwordHash;
    }

    const findEmployeeById = await this.employeeRepository.findOne({
      where: {
        id,
      },
    });

    if (!findEmployeeById) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    const employeeUpdate = await this.employeeRepository.preload({
      id,
      ...allowedData,
    });

    const updatedEmployee = await this.employeeRepository.save(employeeUpdate);

    if (!employeeUpdate || !updatedEmployee) {
      throw new InternalServerErrorException(
        'Erro ao tentar atualizar funcionário',
      );
    }

    return {
      email: updatedEmployee.email,
      name: updatedEmployee.name,
      role: updatedEmployee.role,
      situation: updatedEmployee.situation,
    };
  }

  async updateAdmin(
    employeeIdDTO: UrlUuidDTO,
    updateEmployeeAdminDTO: UpdateEmployeeAdminDTO,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const id = employeeIdDTO.id;

    const allowedData = {
      email: updateEmployeeAdminDTO.email,
      name: updateEmployeeAdminDTO.name,
      password_hash: updateEmployeeAdminDTO.password,
      role: updateEmployeeAdminDTO.role,
      situation: updateEmployeeAdminDTO.situation,
    };

    if (!tokenPayloadDTO.role.includes(EmployeeRole.ADMIN)) {
      throw new ForbiddenException('Ação não permitida');
    }

    const findEmployeeById = await this.employeeRepository.findOne({
      where: {
        id,
      },
    });

    if (!findEmployeeById) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    // Não deixa atualizar outros admins
    for (let i = 0; i < findEmployeeById.role.length; i++) {
      if (
        tokenPayloadDTO.sub !== id &&
        findEmployeeById.role[i] === EmployeeRole.ADMIN
      ) {
        throw new ForbiddenException('Ação não permitida');
      }
    }

    const employeeUpdate = await this.employeeRepository.preload({
      id,
      ...allowedData,
    });

    if (!employeeUpdate) {
      throw new InternalServerErrorException(
        'Erro ao tentar atualizar dados de funcionário',
      );
    }

    return this.employeeRepository.save(employeeUpdate);
  }

  async findByEmail(email: string) {
    const employeeFindByEmail = await this.employeeRepository.findOneBy({
      email,
      situation: EmployeeSituation.EMPLOYED,
    });

    if (!employeeFindByEmail) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    return employeeFindByEmail;
  }

  async findById(id: string) {
    const employeeFindByEmail = await this.employeeRepository.findOneBy({
      id,
      situation: EmployeeSituation.EMPLOYED,
    });

    if (!employeeFindByEmail) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    return employeeFindByEmail;
  }

  async findByName(paginationByNameDTO: PaginationByNameDTO) {
    const { limit, offset, value } = paginationByNameDTO;

    const [employeeFindByName, total] =
      await this.employeeRepository.findAndCount({
        take: limit,
        skip: offset,
        order: {
          id: 'desc',
        },
        where: {
          name: Like(`${value}%`),
          situation: EmployeeSituation.EMPLOYED,
        },
      });

    if (!employeeFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por funcionários',
      );
    }

    if (employeeFindByName.length < 1) {
      throw new NotFoundException('Funcionários não encontrados');
    }

    return [total, ...employeeFindByName];
  }

  async findByRole(paginationByRoleDTO: PaginationByRoleDTO) {
    const { limit, offset, value } = paginationByRoleDTO;

    const [employeeFindByRole, total] =
      await this.employeeRepository.findAndCount({
        take: limit,
        skip: offset,
        order: {
          id: 'desc',
        },
        where: {
          role: value,
          situation: EmployeeSituation.EMPLOYED,
        },
      });

    if (!employeeFindByRole) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por funcionários',
      );
    }

    if (employeeFindByRole.length < 1) {
      throw new NotFoundException('Funcionários não encontrados');
    }

    return [total, ...employeeFindByRole];
  }
}
