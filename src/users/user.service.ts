import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { HashingServiceProtocol } from 'src/auth/hashing/hashing.service';
import { EmailService } from 'src/email/email.service';
import { DataSource, Like, Repository } from 'typeorm';
import { PaginationByNameDTO } from '../common/dto/pagination-name.dto';
import { CreateUserDTO } from './dto/create-user.dto';
import { SearchByEmailDTO } from './dto/search-email-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { ResetPassword } from './entities/reset-password.entity';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    @InjectRepository(ResetPassword)
    private readonly resetPasswordRepository: Repository<ResetPassword>,
    private readonly emailService: EmailService,
    private readonly hashingService: HashingServiceProtocol,
    private dataSource: DataSource,
  ) {}

  async create(createUserDTO: CreateUserDTO) {
    const doesUserAlreadyExists = await this.usersRepository.findOne({
      where: {
        email: createUserDTO.email,
      },
    });

    if (doesUserAlreadyExists) {
      throw new BadRequestException('Usuário já existe');
    }

    let password_hash: string | null = null;

    if (createUserDTO?.password) {
      password_hash = await this.hashingService.hash(createUserDTO.password);
    }

    const userData = {
      name: createUserDTO.name,
      email: createUserDTO.email,
      password_hash,
    };

    const userCreate = this.usersRepository.create(userData);

    const newUser = await this.usersRepository.save(userCreate);

    if (!newUser) {
      throw new InternalServerErrorException('Erro ao criar conta');
    }

    return {
      ...newUser,
    };
  }

  async update(tokenPayloadDTO: TokenPayloadDTO, updateUserDTO: UpdateUserDTO) {
    const allowedData = {
      email: updateUserDTO.email,
      name: updateUserDTO.name,
      password_hash: '',
    };

    const { sub: id } = tokenPayloadDTO;

    if (!id) {
      throw new BadRequestException('Id não enviado');
    }

    await this.dataSource.transaction(async (manager) => {
      const findUserById = await manager.findOne(User, {
        where: {
          id,
        },
      });

      if (!findUserById) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (updateUserDTO.newPassword && !updateUserDTO.currentPassword) {
        throw new BadRequestException('Senha antiga não enviada');
      }

      const updateEmailOrPassword = await this.verifyToUpdateEmailOrPassword(
        findUserById,
        updateUserDTO.currentPassword,
        updateUserDTO.email,
        updateUserDTO.newPassword,
      );

      if (updateEmailOrPassword.email) {
        allowedData.email = updateEmailOrPassword.email;
      }

      if (updateEmailOrPassword.password) {
        allowedData.password_hash = updateEmailOrPassword.password;
      }

      const userUpdate = await manager.update(User, findUserById.id, {
        ...allowedData,
      });

      if (!userUpdate || userUpdate.affected === 0) {
        throw new InternalServerErrorException(
          'Erro ao tentar atualizar dados',
        );
      }
    });

    const newUserData = await this.usersRepository.findOne({
      where: {
        id,
      },
    });

    return {
      success: true,
      name: newUserData.name,
      email: newUserData.email,
    };
  }

  private async verifyToUpdateEmailOrPassword(
    user: User,
    currentPassword: string,
    newEmail?: string,
    newPassword?: string,
  ) {
    const passwordCompare = await this.hashingService.compare(
      currentPassword,
      user.password_hash,
    );

    if (!passwordCompare) {
      throw new UnauthorizedException('Senha incorreta');
    }

    const newData = {
      email: '',
      password: '',
    };

    if (newEmail) newData.email = newEmail;

    if (newPassword) {
      const passwordHash = await this.hashingService.hash(newPassword);

      if (!passwordHash) {
        throw new InternalServerErrorException('Erro ao atualizar senha');
      }

      newData.password = passwordHash;
    }

    return newData;
  }

  async findByEmail(emailDTO: SearchByEmailDTO) {
    const email = emailDTO.email;

    const userFindByEmail = await this.usersRepository.findOneBy({
      email,
    });

    if (!userFindByEmail) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return userFindByEmail;
  }

  async findById(id: string) {
    const userFindById = await this.usersRepository.findOneBy({
      id,
    });

    if (!userFindById) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return userFindById;
  }

  async findByIdMe(tokenPayloadDTO: TokenPayloadDTO) {
    const userFindById = await this.usersRepository.findOneBy({
      id: tokenPayloadDTO.sub,
    });

    if (!userFindById) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return userFindById;
  }

  async findByEmailForGoogle(email: string) {
    const employeeFindByEmail = await this.usersRepository.findOneBy({
      email,
    });

    return employeeFindByEmail;
  }

  async findByName(paginationByNameDTO: PaginationByNameDTO) {
    const { limit, offset, value } = paginationByNameDTO;

    const [userFindByName, total] = await this.usersRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        id: 'desc',
      },
      where: {
        name: Like(`${value}%`),
      },
    });

    if (!userFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por usuários',
      );
    }

    if (userFindByName.length < 1) {
      throw new NotFoundException('Usuários não encontrados');
    }

    return [total, ...userFindByName];
  }
}
