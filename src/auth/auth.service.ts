import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { EmployeeSituation } from 'src/common/enums/employee-situation.enum';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { EmailService } from 'src/email/email.service';
import { Employee } from 'src/employees/entities/employee.entity';
import { LogsService } from 'src/logs-register/log.service';
import { RefreshTokensService } from 'src/refresh-tokens/refresh-token.service';
import { CreateUserDTO } from 'src/users/dto/create-user.dto';
import { ResetPasswordDTO } from 'src/users/dto/reset-password.dto';
import { ResetPassword } from 'src/users/entities/reset-password.entity';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/user.service';
import { ErrorManagement } from 'src/utils/error.util';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { JWTBlacklist } from '../jwt-blacklist/entities/jwt_blacklist.entity';
import jwtConfig from './config/jwt.config';
import { LoginUserDTO } from './dto/login-user.dto';
import { LoginDTO } from './dto/login.dto';
import { LogoutDTO } from './dto/logout.dto';
import { UpdatePasswordDTO } from './dto/update-password.dto';
import { HashingServiceProtocol } from './hashing/hashing.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(ResetPassword)
    private readonly resetPasswordRepository: Repository<ResetPassword>,

    @InjectRepository(JWTBlacklist)
    private readonly jwtBlacklistRepository: Repository<JWTBlacklist>,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly hashingService: HashingServiceProtocol,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokensService,
    private readonly userService: UsersService,
    private readonly logService: LogsService,
    private readonly emailsService: EmailService,
    private readonly logger: Logger,
    private dataSource: DataSource,
  ) {}

  async LoginEmployee(loginDTO: LoginDTO) {
    const findEmployee = await this.employeeRepository.findOneBy({
      email: loginDTO.email,
      situation: EmployeeSituation.EMPLOYED,
    });

    if (!findEmployee) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const passwordCompare = await this.hashingService.Compare(
      loginDTO.password,
      findEmployee.password_hash,
    );

    if (!passwordCompare) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const create = await this.CreateTokensEmployee(findEmployee);

    return create;
  }

  async LoginUser(loginDTO: LoginDTO) {
    const findUser = await this.userRepository.findOneBy({
      email: loginDTO.email,
    });

    if (!findUser) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const passwordCompare = await this.hashingService.Compare(
      loginDTO.password,
      findUser.password_hash,
    );

    if (!passwordCompare) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const create = await this.CreateTokensUser(findUser);

    return create;
  }

  async Register(loginUserDTO: LoginUserDTO) {
    let user: User;

    await this.dataSource.transaction(async (manager) => {
      const findUser = await manager.findOneBy(User, {
        email: loginUserDTO.email,
        name: loginUserDTO.name,
      });

      if (findUser) {
        throw new BadRequestException('Usuário já existe');
      }

      const password_hash = await this.hashingService.Hash(
        loginUserDTO.password,
      );

      const userData = {
        name: loginUserDTO.name,
        email: loginUserDTO.email,
        password_hash,
      };

      const userCreate = manager.create(User, userData);

      user = await manager.save(User, userCreate);
    });

    const create = await this.CreateTokensUser(user);

    return create;
  }

  async ResetPassword(resetPasswordDTO: ResetPasswordDTO) {
    const { email } = resetPasswordDTO;

    const findUser = await this.userRepository.findOne({
      where: {
        email,
      },
    });

    // Enviado junto com o link
    const newToken = crypto.randomBytes(32).toString('hex');

    // Salvo no banco de dados
    const tokenHash = crypto
      .createHash('sha256')
      .update(newToken)
      .digest('hex');

    const resetPasswordData = {
      tokenHash,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutos
      user: findUser || null,
    };

    const newResetPasswordAttempt =
      this.resetPasswordRepository.create(resetPasswordData);

    await this.resetPasswordRepository.save(newResetPasswordAttempt);

    return this.emailsService.ResetPassword(email, newToken);
  }

  async UpdatePassword(updatePasswordDTO: UpdatePasswordDTO) {
    const { token } = updatePasswordDTO;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    let userId = '';

    await this.dataSource.transaction(async (manager) => {
      const findResetPassAttemptRegister = await manager.findOne(
        ResetPassword,
        {
          where: {
            tokenHash,
            used: false,
            expiresAt: MoreThan(new Date()),
          },
          relations: {
            user: true,
          },
        },
      );

      this.logger.log(findResetPassAttemptRegister);

      if (!findResetPassAttemptRegister) {
        throw new BadRequestException('Token inválido ou expirado');
      }

      const updatedPassword = await this.hashingService.Hash(
        updatePasswordDTO.newPassword,
      );

      if (!updatedPassword) {
        throw new InternalServerErrorException('Erro ao criar nova senha');
      }

      const updateUserPassword = await manager.update(
        User,
        findResetPassAttemptRegister.user.id,
        {
          password_hash: updatedPassword,
        },
      );

      if (!updateUserPassword || updateUserPassword.affected === 0) {
        throw new InternalServerErrorException('Erro ao atualizar senha');
      }

      const updateUsedField = await manager.update(
        ResetPassword,
        findResetPassAttemptRegister.id,
        {
          used: true,
        },
      );

      if (!updateUsedField || updateUsedField.affected === 0) {
        throw new InternalServerErrorException(
          'Erro ao atualizar estado do token',
        );
      }

      userId = findResetPassAttemptRegister.user.id;
    });

    const findUser = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (!findUser) {
      throw new NotFoundException(
        'Não foi possível recuperar os dados do usuário',
      );
    }

    return {
      success: true,
      email: findUser.email,
      name: findUser.name,
      newPasswordHash: findUser.password_hash,
    };
  }

  async LogoutEmployee(logoutDto: LogoutDTO) {
    const jwtBlacklistData = {
      email: logoutDto.email,
      token: logoutDto.token,
    };

    const findEmployee = await this.employeeRepository.findOne({
      where: {
        email: logoutDto.email,
      },
    });

    await this.refreshTokenService.RevokeAllEmployee(findEmployee, true);

    const createLogout = this.jwtBlacklistRepository.create(jwtBlacklistData);

    const newLogout = await this.jwtBlacklistRepository.save(createLogout);

    if (!createLogout || !newLogout) {
      throw new InternalServerErrorException('Erro ao criar logout');
    }

    return 'Logout criado com suceso';
  }

  async LogoutUser(logoutDto: LogoutDTO) {
    const jwtBlacklistData = {
      email: logoutDto.email,
      token: logoutDto.token,
    };

    const findUser = await this.userRepository.findOne({
      where: {
        email: logoutDto.email,
      },
    });

    await this.refreshTokenService.RevokeAllUser(findUser, true);

    const createLogout = this.jwtBlacklistRepository.create(jwtBlacklistData);

    const newLogout = await this.jwtBlacklistRepository.save(createLogout);

    if (!createLogout || !newLogout) {
      throw new InternalServerErrorException('Erro ao criar logout');
    }

    return 'Logout criado com suceso';
  }

  async CreateTokensEmployee(employeeData: Employee) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let accessToken: string = '';
    let refreshToken: string = '';

    try {
      const createToken = await this.refreshTokenService.CreateEmployee(
        employeeData,
        queryRunner,
      );

      accessToken = await this.SignJwtAsync(
        employeeData.id,
        this.jwtConfiguration.jwtTtl,
        { email: employeeData.email, role: employeeData.role },
      );

      refreshToken = await this.SignJwtAsync(
        employeeData.id,
        this.jwtConfiguration.jwtRefreshTtl,
        { id: createToken.token_id },
      );

      const dataForLog = {
        email: employeeData.email,
        name: employeeData.name,
        employee: employeeData,
      };

      await this.logService.CreateLogEmployee(dataForLog, queryRunner);

      await queryRunner.commitTransaction();

      return {
        accessToken,
        refreshToken,
        email: employeeData.email,
        name: employeeData.name,
        id: employeeData.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      try {
        await this.emailsService.LogIssue('funcionário');
      } catch (emailErr) {
        this.logger.error(
          'Falha ao enviar e-mail de alerta de erro de autenticação',
          emailErr,
        );
      }

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao criar novo par de tokens',
        queryFailedError: 'Erro nos registros de autenticação',
        internalServerError: 'Erro interno ao criar novo par de tokens',
        generalError: 'Falha ao processar transação da autenticação',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async CreateTokensUser(user: User) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let accessToken: string = '';
    let refreshToken: string = '';

    try {
      const createToken = await this.refreshTokenService.CreateUser(
        user,
        queryRunner,
      );

      accessToken = await this.SignJwtAsync<Partial<User>>(
        user.id,
        this.jwtConfiguration.jwtTtl,
        { email: user.email },
      );

      refreshToken = await this.SignJwtAsync<Partial<User>>(
        user.id,
        this.jwtConfiguration.jwtRefreshTtl,
        { id: createToken.token_id },
      );

      const dataForLog = {
        email: user.email,
        name: user.name,
        user: user,
      };

      await this.logService.CreateLogUser(dataForLog, queryRunner);

      await queryRunner.commitTransaction();

      return {
        accessToken,
        refreshToken,
        email: user.email,
        name: user.name,
        id: user.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao criar novo par de tokens',
        queryFailedError: 'Erro nos registros de autenticação',
        internalServerError: 'Erro interno ao criar novo par de tokens',
        generalError: 'Falha ao processar transação da autenticação',
      });

      try {
        await this.emailsService.LogIssue('usuário');
      } catch (emailErr) {
        this.logger.error(
          'Falha ao enviar e-mail de alerta de erro de autenticação',
          emailErr,
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  async SignJwtAsync<T>(sub: string, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn,
      },
    );
  }

  async ValidateGoogleUser(googleUser: CreateUserDTO) {
    const createUser = await this.userService.FindByEmailForGoogle(
      googleUser.email,
    );

    if (createUser && createUser.password_hash === null) return createUser;

    if (createUser.password_hash) {
      throw new BadRequestException('Conta do usuário já registrada');
    }

    return await this.userService.Create(googleUser);
  }
}
