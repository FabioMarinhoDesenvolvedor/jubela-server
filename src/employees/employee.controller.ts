import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SetRoutePolicy } from 'src/auth/decorators/set-route-policy.decorator';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { RoutePolicyGuard } from 'src/auth/guards/route-policy.guard';
import { TokenPayloadParam } from 'src/auth/params/token-payload.param';
import { PaginationByNameDTO } from 'src/common/dto/pagination-name.dto';
import { EmployeeRole } from 'src/common/enums/employee-role.enum';
import { UrlUuidDTO } from '../common/dto/url-uuid.dto';
import { CreateEmployeeDTO } from './dto/create-employee.dto';
import { PaginationByRoleDTO } from './dto/pagination-employee-role.dto';
import { UpdateEmployeeAdminDTO } from './dto/update-employee-admin.dto';
import { UpdateEmployeeDTO } from './dto/update-employee.dto';
import { EmployeesService } from './employee.service';

@UseGuards(RoutePolicyGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Post()
  @SetRoutePolicy(EmployeeRole.ADMIN)
  create(@Body() body: CreateEmployeeDTO) {
    return this.employeesService.create(body);
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Patch('update/self/:id')
  updateSelf(
    @Param('id') id: UrlUuidDTO,
    @Body() updateEmployeeDTO: UpdateEmployeeDTO,
    @TokenPayloadParam() TokenPayloadDTO: TokenPayloadDTO,
  ) {
    return this.employeesService.updateSelf(
      id,
      updateEmployeeDTO,
      TokenPayloadDTO,
    );
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Patch('update/admin/:id')
  @SetRoutePolicy(EmployeeRole.ADMIN)
  updateAdmin(
    @Param('id') id: UrlUuidDTO,
    @Body() updateEmployeeAdminDTO: UpdateEmployeeAdminDTO,
    @TokenPayloadParam() tokenPayloadDTO: TokenPayloadDTO,
  ) {
    return this.employeesService.updateAdmin(
      id,
      updateEmployeeAdminDTO,
      tokenPayloadDTO,
    );
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Get('search/email/:email')
  @SetRoutePolicy(EmployeeRole.ADMIN)
  findByEmail(@Param('email') email: string) {
    return this.employeesService.findByEmail(email);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Get('search/name/')
  @SetRoutePolicy(EmployeeRole.ADMIN)
  findByName(@Query() paginationByNameDto: PaginationByNameDTO) {
    return this.employeesService.findByName(paginationByNameDto);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Get('search/role/')
  @SetRoutePolicy(EmployeeRole.ADMIN)
  findByRole(@Query() paginationByRoleDto: PaginationByRoleDTO) {
    return this.employeesService.findByRole(paginationByRoleDto);
  }
}
