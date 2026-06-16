import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UploadApiResponse } from 'cloudinary';
import 'multer';
import { TokenPayloadDTO } from 'src/auth/dto/token-payload.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { GeneralErrorType } from 'src/common/enums/general-error-type.enum';
import { EmailService } from 'src/email/email.service';
import { EmployeesService } from 'src/employees/employee.service';
import { Employee } from 'src/employees/entities/employee.entity';
import { GetErrorMessage } from 'src/utils/error-message.util';
import { ErrorManagement } from 'src/utils/error.util';
import { DataSource, Like, QueryRunner, Repository } from 'typeorm';
import { CreateProductDTO } from './dto/create-product.dto';
import { PaginationByEmployeeDTO } from './dto/pagination-by-employee.dto';
import { UpdatePriceProductDTO } from './dto/update-product-price.dto';
import { UpdateProductDTO } from './dto/update-product.dto';
import { ProductImages } from './entities/product-images.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,

    @InjectRepository(ProductImages)
    private readonly productImagesRepository: Repository<ProductImages>,
    private readonly employeesService: EmployeesService,
    private readonly emailService: EmailService,
    private readonly cloudinaryService: CloudinaryService,

    private dataSource: DataSource,
  ) {}

  async Create(
    createProductDTO: CreateProductDTO,
    files: Array<Express.Multer.File>,
    tokenPayloadDTO: TokenPayloadDTO,
  ) {
    const { sub } = tokenPayloadDTO;

    const findEmployee = await this.employeesService.FindById(sub);

    if (!findEmployee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    let uploadResults: UploadApiResponse[];

    try {
      uploadResults = await this.cloudinaryService.UploadMultipleImages(
        files,
        'products',
      );
    } catch (error) {
      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao fazer upload das imagens:',
        queryFailedError: '',
        internalServerError: 'Erro interno ao realizar upload de imagens',
        generalError: 'Erro ao fazer upload das imagens',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doesEmployeeReallyExists = await queryRunner.manager.findOne(
        Employee,
        {
          where: {
            id: tokenPayloadDTO.sub,
          },
        },
      );

      if (!doesEmployeeReallyExists) {
        throw new NotFoundException('Funcionário não encontrado');
      }

      const createProductData = {
        ...createProductDTO,
        employee: findEmployee,
      };

      const createProduct = queryRunner.manager.create(
        Product,
        createProductData,
      );

      const newProduct = await queryRunner.manager.save(Product, createProduct);

      const images = uploadResults.map((result, index) => {
        return queryRunner.manager.create(ProductImages, {
          url: result.secure_url,
          publicId: result.public_id,
          isMain: index === 0,
          order: index + 1,
          product: newProduct,
        });
      });

      await queryRunner.manager.save(ProductImages, images);

      await queryRunner.commitTransaction();

      const createdProduct = await this.productsRepository.findOne({
        where: {
          id: newProduct.id,
        },
        relations: {
          images: true,
        },
      });

      if (!createProduct) {
        throw new NotFoundException('Produto não encontrado');
      }

      return createdProduct;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      try {
        const publicIds = uploadResults.map((results) => results.public_id);
        await this.cloudinaryService.DeleteMultipleImages(publicIds);
      } catch (cleanupError) {
        // Se cleanup falhar, loga mas não quebra a aplicação
        this.logger.error('Erro ao fazer cleanup das imagens:', cleanupError);
        // Você pode enviar para um sistema de log/monitoramento aqui
      }

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao cadastrar produto:',
        queryFailedError: 'Erro ao registrar produto',
        internalServerError: 'Erro interno cadastrar produto',
        generalError: 'Falha ao processar transação na criação de produto',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async Update(
    id: string,
    imageId: string,
    updateProductDTO: UpdateProductDTO,
    file: Express.Multer.File,
  ) {
    const updatesPerformed = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const findProduct = await queryRunner.manager.findOne(Product, {
        where: {
          id,
        },
      });

      if (!findProduct) {
        throw new NotFoundException('Produto não encontrado');
      }

      if (file) {
        await this.ReplaceImage(findProduct, imageId, file, queryRunner);
        updatesPerformed.push('image');
      }

      await this.UpdateRegularData(findProduct, updateProductDTO, queryRunner);

      for (let i = 0; i < Object.keys(updateProductDTO).length; i++) {
        updatesPerformed.push(Object.keys(updateProductDTO));
      }

      await queryRunner.commitTransaction();

      const findUpdatedProduct = await this.productsRepository.findOne({
        where: {
          id,
        },
      });

      return {
        updatedFields: updatesPerformed,
        product: findUpdatedProduct,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao atualizar produto:',
        queryFailedError: 'Erro ao atualizar dados de produto',
        internalServerError: 'Erro interno ao atualizar produto',
        generalError: 'Falha ao processar transação na atualização do produto',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async UpdatePrice(
    id: string,
    updateProductPriceDataDTO: UpdatePriceProductDTO,
  ) {
    const findProduct = await this.productsRepository.findOne({
      where: {
        id,
      },
    });

    if (!findProduct) {
      throw new NotFoundException('Produto não encontrado');
    }

    const productUpdate = await this.productsRepository.preload({
      id,
      price: updateProductPriceDataDTO.price,
    });

    const updatedProduct = await this.productsRepository.save(productUpdate);

    if (!productUpdate || !updatedProduct) {
      throw new InternalServerErrorException(
        'Erro ao tentar atualizar preço do produto',
      );
    }

    return updatedProduct;
  }

  private async UpdateRegularData(
    product: Product,
    updateProductRegularDataDTO: UpdateProductDTO,
    queryRunnerSub: QueryRunner,
  ) {
    if (Object.keys(updateProductRegularDataDTO).length < 1) return;

    const productUpdate = await queryRunnerSub.manager.update(
      Product,
      product.id,
      {
        id: product.id,
        ...updateProductRegularDataDTO,
      },
    );

    if (!productUpdate || productUpdate.affected < 1) {
      throw new InternalServerErrorException(
        'Erro ao tentar atualizar produto',
      );
    }
  }

  /**
   * Substitui uma imagem específica por outra
   * Mantém a ordem e se é principal ou não
   */
  private async ReplaceImage(
    product: Product,
    imageId: string,
    file: Express.Multer.File,
    queryRunnerSub: QueryRunner,
  ) {
    const imageToReplace = product.images.find((img) => img.id === imageId);

    if (!imageToReplace) {
      throw new NotFoundException('Imagem não encontrada');
    }

    // Guarda informações da imagem antiga
    const { publicId: oldPublicId } = imageToReplace;

    // 2. Upload da nova imagem ANTES da transação
    let uploadResult: UploadApiResponse;
    try {
      const results = await this.cloudinaryService.UploadMultipleImages(
        [file],
        'products',
      );
      uploadResult = results[0];
    } catch (error) {
      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao fazer upload da imagem:',
        queryFailedError: '',
        internalServerError: 'Erro interno ao fazer upload de imagem',
        generalError: 'Erro ao fazer upload da imagem',
      });
    }

    // 3. Transação: Atualiza no banco

    // ✅ ATUALIZA a entidade existente (não cria nova)
    imageToReplace.url = uploadResult.secure_url;
    imageToReplace.publicId = uploadResult.public_id;
    // isMain e order permanecem iguais

    await queryRunnerSub.manager.save(ProductImages, imageToReplace);

    // 4. Deleta a imagem antiga do Cloudinary
    try {
      await this.cloudinaryService.DeleteMultipleImages([oldPublicId]);
    } catch (error) {
      // Cleanup: deleta nova imagem do Cloudinary para não deixar órfã
      try {
        await this.cloudinaryService.DeleteMultipleImages([
          uploadResult.public_id,
        ]);
      } catch (cleanupError) {
        this.logger.error('Erro no cleanup:', cleanupError);
      }

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao deletar imagem antiga do Cloudinary:',
        queryFailedError: 'Erro ao atualizar registro de imagem',
        internalServerError: 'Erro interno ao atualizar imagem',
        generalError: 'Erro ao substituir imagem, operação revertida',
      });
    }
  }

  /**
   * Adiciona novas imagens a um produto existente
   */
  async AddImages(productId: string, files: Express.Multer.File[]) {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
      relations: {
        images: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Validação: limite máximo de imagens
    const MAX_IMAGES = 4;
    if (product.images.length + files.length > MAX_IMAGES) {
      throw new BadRequestException(
        `Produto pode ter no máximo ${MAX_IMAGES} imagens`,
      );
    }

    // 1. Upload das novas imagens
    let uploadResults: UploadApiResponse[];
    try {
      uploadResults = await this.cloudinaryService.UploadMultipleImages(
        files,
        'products',
      );
    } catch (error) {
      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao fazer upload das imagens:',
        queryFailedError: '',
        internalServerError:
          'Erro interno ao fazer upload das imagens do produto',
        generalError: 'Erro interno ao fazer upload de imagens',
      });
    }

    // 2. Transação: Adiciona no banco
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doesProductReallyExists = await queryRunner.manager.findOne(
        Product,
        {
          where: {
            id: productId,
          },
        },
      );

      if (!doesProductReallyExists) {
        throw new NotFoundException('Produto não encontrado');
      }

      // Pega a maior ordem atual
      const currentMaxOrder =
        product.images.length > 0
          ? Math.max(...product.images.map((img) => img.order))
          : 0;

      // Cria novas entidades de imagem
      const newImages = uploadResults.map((result, index) => {
        return queryRunner.manager.create(ProductImages, {
          url: result.secure_url,
          publicId: result.public_id,
          isMain: false, // Novas imagens não são principais
          order: currentMaxOrder + index + 1,
          product: product,
        });
      });

      await queryRunner.manager.save(ProductImages, newImages);

      await queryRunner.commitTransaction();

      return this.productsRepository.findOne({
        where: { id: productId },
        relations: {
          images: true,
        },
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Cleanup: deleta do Cloudinary
      const publicIds = uploadResults.map((r) => r.public_id);
      try {
        await this.cloudinaryService.DeleteMultipleImages(publicIds);
      } catch (cleanupError) {
        this.logger.error('Erro no cleanup:', cleanupError);
      }

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao adicionar imagens no banco de dados:',
        queryFailedError: 'Erro ao adicionar registros de imagens',
        internalServerError: 'Erro interno ao registrar imagens do produto',
        generalError: 'Erro interno ao fazer upload de imagens',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async RemoveImage(productId: string, imageId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const findProduct = await queryRunner.manager.findOne(Product, {
        where: {
          id: productId,
        },
        relations: {
          images: true,
        },
      });

      if (!findProduct) {
        throw new NotFoundException('Produto não encontrado');
      }

      const imageToRemove = findProduct.images.find(
        (img) => img.id === imageId,
      );

      if (!imageToRemove) {
        throw new NotFoundException('Imagem não encontrada');
      }

      const publicIdToDelete = imageToRemove.publicId;

      await queryRunner.manager.remove(ProductImages, imageToRemove);

      const remainingImages = await queryRunner.manager.find(ProductImages, {
        where: { product: { id: productId } },
        order: { order: 'ASC' },
      });

      if (remainingImages.length > 0) {
        remainingImages.forEach((img, index) => {
          img.order = index + 1;
        });

        await queryRunner.manager.save(ProductImages, remainingImages);
      }

      await queryRunner.commitTransaction();

      try {
        await this.cloudinaryService.DeleteMultipleImages([publicIdToDelete]);
      } catch (cloudinaryError) {
        // ⚠️ Banco já foi commitado, então não podemos reverter
        // Loga o erro para investigação/cleanup manual
        const errorMessage = GetErrorMessage(cloudinaryError);

        this.logger.error(
          `ATENÇÃO: Imagem deletada do banco mas falhou no Cloudinary:`,
          {
            productId,
            imageId,
            publicId: publicIdToDelete,
            error: errorMessage,
          },
        );

        // Aqui você poderia:
        // - Adicionar em uma fila de cleanup
        // - Enviar alerta para monitoramento
        // - Gravar em tabela de "orphan_images" para cleanup posterior
      }

      return this.productsRepository.findOne({
        where: { id: productId },
        relations: {
          images: true,
        },
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao apagar imagens:',
        queryFailedError: 'Erro ao apagar registro de imagem',
        internalServerError: 'Erro interno ao remover imagem',
        generalError:
          'Falha ao processar transação da remoção das imagens do produto',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async Delete(id: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await queryRunner.manager.findOne(Product, {
        where: { id },
        relations: {
          images: true,
        },
      });

      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }

      const publicIdsToDelete = product.images.map((img) => img.publicId);

      await queryRunner.manager.remove(Product, product);

      await queryRunner.commitTransaction();

      if (publicIdsToDelete.length > 0) {
        await this.DeleteFromCloudinaryAsync(publicIdsToDelete).catch(
          (error) => {
            this.logger.error('Erro ao deletar do Cloudinary:', error);
          },
        );
      }

      return { message: 'Produto deletado com sucesso' };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro ao excluir produto:',
        queryFailedError: 'Erro ao apagar registro de produto',
        internalServerError: 'Erro interno ao deletar produto',
        generalError: 'Falha ao processar transação na exclusão de produto',
      });
    } finally {
      await queryRunner.release();
    }
  }

  private async DeleteFromCloudinaryAsync(publicIds: string[]): Promise<void> {
    try {
      await this.cloudinaryService.DeleteMultipleImages(publicIds);
    } catch (error) {
      // // Registra órfãos para cleanup
      // await this.orphanCleanupService.logOrphanImages(
      //   publicIds,
      //   productId,
      //   'Produto deletado',
      // );
      ErrorManagement(error, GeneralErrorType.INTERNAL, {
        logger: 'Erro do cloudinary - múltiplas imagens',
        queryFailedError: '',
        internalServerError: 'Erro interno ao deletar múltiplas imagens',
        generalError: 'Erro ao deletar imagens',
      });
    }
  }

  async FindById(id: string) {
    const productFindById = await this.productsRepository.findOneBy({
      id,
    });

    if (!productFindById) {
      throw new NotFoundException('Produto não encontrado');
    }

    return productFindById;
  }

  async ListProducts() {
    const items = await this.productsRepository.find({
      order: {
        id: 'desc',
      },
      where: {},
    });

    return items;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async StockCheck(productId: string, orderQuantity: number, orderId?: string) {
    const findProduct = await this.productsRepository.findOneBy({
      id: productId,
    });

    const { quantity, lowStock } = findProduct;

    switch (true) {
      case quantity < 1:
        throw new BadRequestException(`Produto ${findProduct.name} esgotado`);

      case orderQuantity > quantity:
        throw new BadRequestException(
          `Estoque do produto  ${findProduct.name} insuficiente`,
        );

      case quantity <= lowStock && quantity >= orderQuantity:
        await this.emailService.LowStockWarn(findProduct);
        return;
    }
  }

  async FindByName(name: string) {
    const productFindByName = await this.productsRepository.find({
      order: {
        id: 'desc',
      },
      where: {
        name: Like(`${name}%`),
      },
    });

    if (!productFindByName) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por produtos',
      );
    }

    if (productFindByName.length < 1) {
      throw new NotFoundException('Produtos não encontrados');
    }

    return productFindByName;
  }

  async FindByCategory(category: string) {
    const productFindByCategory = await this.productsRepository.find({
      order: {
        id: 'desc',
      },
      where: {
        category: Like(`${category}%`),
      },
    });

    if (!productFindByCategory) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por produtos',
      );
    }

    if (productFindByCategory.length < 1) {
      throw new NotFoundException('Produtos não encontrados');
    }

    return productFindByCategory;
  }

  async FindBySku(sku: string) {
    const productFindBySku = await this.productsRepository.findOneBy({
      sku,
    });

    if (!productFindBySku) {
      throw new NotFoundException('Produto não encontrado');
    }

    return productFindBySku;
  }

  async FindByEmployee(paginationByEmployeeDTO: PaginationByEmployeeDTO) {
    const { limit, offset, value } = paginationByEmployeeDTO;

    const [productFindByEmployee, total] =
      await this.productsRepository.findAndCount({
        take: limit,
        skip: offset,
        order: {
          id: 'desc',
        },
        where: {
          employee: {
            id: value,
          },
        },
        relations: {
          employee: true,
        },
        select: {
          employee: {
            id: true,
            name: true,
            email: true,
            situation: true,
            role: true,
          },
        },
      });

    if (!productFindByEmployee) {
      throw new InternalServerErrorException(
        'Erro desconhecido ao tentar pesquisar por produtos',
      );
    }

    if (productFindByEmployee.length < 1) {
      throw new NotFoundException('Produtos não encontrados');
    }

    return [total, ...productFindByEmployee];
  }
}
