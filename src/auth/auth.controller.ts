import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ResetPasswordDTO } from 'src/users/dto/reset-password.dto';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/user.service';
import { AuthService } from './auth.service';
import { Public } from './decorators/set-metadata.decorator';
import { LoginUserDTO } from './dto/login-user.dto';
import { LoginDTO } from './dto/login.dto';
import { LogoutDTO } from './dto/logout.dto';
import { UpdatePasswordDTO } from './dto/update-password.dto';
import { GoogleAuthGuard } from './guards/google.guard';
import { GoogleAuthUser } from './params/google-user.param';

// @SkipCsrf()
@SkipThrottle({ read: true, write: true, refresh: true, preference: true })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('employee')
  async loginEmployee(
    @Res({ passthrough: true }) res: Response,
    @Body() loginDto: LoginDTO,
  ) {
    const createTokens = await this.authService.loginEmployee(loginDto);

    res.cookie('accessToken', createTokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 20, // 20 minutos
      path: '/',
    });

    res.cookie('refreshToken', createTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
      path: '/refresh/employee',
    });

    return {
      success: true,
      message: 'Autenticação concluída',
      email: createTokens.email,
      name: createTokens.name,
      id: createTokens.id,
    };
  }

  @Public()
  @Post('user')
  async loginUser(
    @Res({ passthrough: true }) res: Response,
    @Body() loginDto: LoginDTO,
  ) {
    const createTokens = await this.authService.loginUser(loginDto);

    res.cookie('accessToken', createTokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 20, // 20 minutos
      path: '/',
    });

    res.cookie('refreshToken', createTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
      path: '/refresh/user',
    });

    return {
      success: true,
      email: createTokens.email,
      name: createTokens.name,
      id: createTokens.id,
    };
  }

  @Public()
  @Post('register')
  async registerUser(
    @Res({ passthrough: true }) res: Response,
    @Body() loginUserDto: LoginUserDTO,
  ) {
    const createTokens = await this.authService.register(loginUserDto);

    res.cookie('accessToken', createTokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 20, // 20 minutos
      path: '/',
    });

    res.cookie('refreshToken', createTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
      path: '/refresh/user',
    });

    return {
      success: true,
      id: createTokens.id,
      name: createTokens.name,
      email: createTokens.email,
    };
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() body: ResetPasswordDTO) {
    return this.authService.resetPassword(body);
  }

  @Public()
  @Post('reset-password')
  updatePassword(@Body() body: UpdatePasswordDTO) {
    return this.authService.updatePassword(body);
  }

  @Post('logout/employee')
  async logoutEmployee(
    @Body() logoutDto: LogoutDTO,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutEmployee(logoutDto);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return { success: true, message: 'Logout concluído' };
  }

  @Post('logout/user')
  async logoutUser(
    @Body() logoutDto: LogoutDTO,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutUser(logoutDto);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return { success: true, message: 'Logout concluído' };
  }

  // Não precisa de métodos aqui, só o guard já basta
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/login')
  googleLogin() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@GoogleAuthUser() user: User, @Res() res: Response) {
    const createTokens = await this.authService.createTokensUser(user);

    res.cookie('accessToken', createTokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 20, // 20 minutos
      path: '/',
    });

    res.cookie('refreshToken', createTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
      path: '/refresh/user',
    });

    res.redirect('https://jubela-client.vercel.app/');
  }
}
