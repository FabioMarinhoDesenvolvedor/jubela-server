import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import 'multer';
import { Public } from 'src/auth/decorators/set-metadata.decorator';
import { SetRoutePolicy } from 'src/auth/decorators/set-route-policy.decorator';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { RoutePolicyGuard } from 'src/auth/guards/route-policy.guard';
import { TokenPayloadParam } from 'src/auth/params/token-payload.param';

import { EmployeeRole } from 'src/common/enums/employee-role.enum';
import { CreateProductDTO } from './dto/create-product.dto';
import { DeleteImagesDTO } from './dto/delete-images.dto';
import { PaginationByEmployeeDTO } from './dto/pagination-by-employee.dto';
import { ProductFindByCategoryDTO } from './dto/product-find-by-category.dto';
import { ProductFindByNameDTO } from './dto/product-find-by-name.dto';
import { UpdatePriceProductDTO } from './dto/update-product-price.dto';
import { UpdateProductDTO } from './dto/update-product.dto';
import { ProductsService } from './product.service';

@UseGuards(RoutePolicyGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Post()
  @SetRoutePolicy(EmployeeRole.EDIT_PRODUCTS)
  @UseInterceptors(
    FilesInterceptor('files', 4, {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 mb
      },
      fileFilter: (req, file, cb) => {
        // Validação RÁPIDA de tipo
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(
            new BadRequestException('Apenas imagens são permitidas'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  Create(
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /jpeg|jpg|png/g })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    files: Array<Express.Multer.File>,

    @TokenPayloadParam()
    tokenPayloadDTO: TokenPayloadDTO,

    @Body() body: CreateProductDTO,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Pelo menos uma imagem é obrigatória');
    }

    return this.productsService.Create(body, files, tokenPayloadDTO);
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Post('/addImages/:id')
  @SetRoutePolicy(EmployeeRole.EDIT_PRODUCTS)
  @UseInterceptors(
    FilesInterceptor('files', 4, {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 mb
      },
      fileFilter: (req, file, cb) => {
        // Validação RÁPIDA de tipo
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(
            new BadRequestException('Apenas imagens são permitidas'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  AddImages(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /jpeg|jpg|png/g })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    files: Array<Express.Multer.File>,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Pelo menos uma imagem é obrigatória');
    }

    return this.productsService.AddImages(id, files);
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Patch('update/:id/:imageId?')
  @SetRoutePolicy(EmployeeRole.EDIT_PRODUCTS)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 mb
      },
      fileFilter: (req, file, cb) => {
        // Validação RÁPIDA de tipo
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(
            new BadRequestException('Apenas imagens são permitidas'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  Update(
    @Param('id') id: string,
    @Body() body: UpdateProductDTO,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /jpeg|jpg|png/g })
        .build({
          fileIsRequired: false,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file?: Express.Multer.File,
    @Param('imageId') imageId?: string,
  ) {
    return this.productsService.Update(id, imageId, body, file);
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Patch('update/price')
  @SetRoutePolicy(EmployeeRole.EDIT_PRODUCTS)
  UpdatePrices(@Param('id') id: string, @Body() body: UpdatePriceProductDTO) {
    return this.productsService.UpdatePrice(id, body);
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Delete('delete/images')
  @SetRoutePolicy(EmployeeRole.EDIT_PRODUCTS)
  DeleteImages(@Body() body: DeleteImagesDTO) {
    return this.productsService.RemoveImage(body.productId, body.imageId);
  }

  @SkipThrottle({ read: true, auth: true, refresh: true, preference: true })
  @Delete(':id')
  @SetRoutePolicy(EmployeeRole.EDIT_PRODUCTS)
  Delete(@Param('id') id: string) {
    return this.productsService.Delete(id);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Public()
  @Get()
  async ListProducts() {
    const allProducts = await this.productsService.ListProducts();

    if (allProducts.length < 1) {
      return {
        status: HttpStatus.NO_CONTENT,
        message: 'Nenhum produto cadastrado ainda',
      };
    }

    return allProducts;
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Get('search/sku/:sku')
  @SetRoutePolicy(EmployeeRole.READ_PRODUCTS)
  FindBySku(@Param('sku') sku: string) {
    return this.productsService.FindBySku(sku);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Public()
  @Get('search/name/:name')
  FindByName(@Param() name: ProductFindByNameDTO) {
    return this.productsService.FindByName(name);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Public()
  @Get('search/category/:category')
  FindByRole(@Param() category: ProductFindByCategoryDTO) {
    return this.productsService.FindByCategory(category);
  }

  @SkipThrottle({ write: true, auth: true, refresh: true, preference: true })
  @Get('search/employee/')
  @SetRoutePolicy(EmployeeRole.READ_PRODUCTS)
  FindByEmployee(@Query() paginationByEmployeeDto: PaginationByEmployeeDTO) {
    return this.productsService.FindByEmployee(paginationByEmployeeDto);
  }
}
