import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SetRoutePolicy } from 'src/auth/decorators/set-route-policy.decorator';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { RoutePolicyGuard } from 'src/auth/guards/route-policy.guard';
import { TokenPayloadParam } from 'src/auth/params/token-payload.param';
import { EmployeeRole } from 'src/common/enums/employee-role.enum';
import { IsNotEmptyPayloadPipe } from 'src/common/pipes/empty-payload-validation.pipe';
import { PaginationByNameDTO } from '../common/dto/pagination-name.dto';
import { SearchByEmailDTO } from './dto/search-email-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { UsersService } from './user.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @UsePipes(IsNotEmptyPayloadPipe)
  @Patch()
  update(
    @Body() updateUserDTO: UpdateUserDTO,
    @TokenPayloadParam() tokenPayloadDTO: TokenPayloadDTO,
  ) {
    return this.usersService.update(tokenPayloadDTO, updateUserDTO);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Get('me')
  findMe(@TokenPayloadParam() tokenPayloadDTO: TokenPayloadDTO) {
    return this.usersService.findByIdMe(tokenPayloadDTO);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @UseGuards(RoutePolicyGuard)
  @Get('search/email/:email')
  @SetRoutePolicy(EmployeeRole.ADMIN)
  findByEmail(@Param('email') email: SearchByEmailDTO) {
    return this.usersService.findByEmail(email);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @UseGuards(RoutePolicyGuard)
  @Get('search/name/')
  @SetRoutePolicy(EmployeeRole.ADMIN)
  findByName(@Query() paginationByNameDto: PaginationByNameDTO) {
    return this.usersService.findByName(paginationByNameDto);
  }
}
