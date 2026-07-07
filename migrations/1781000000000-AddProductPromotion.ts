import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona suporte a promoções na tabela `product`:
 * - promoPrice: preço promocional (numeric, opcional);
 * - promoEndsAt: data de término da promoção (timestamptz, opcional).
 *
 * Idempotente (IF NOT EXISTS / IF EXISTS) para ser segura em produção.
 * NÃO altera dados existentes — colunas nascem nulas (sem promoção).
 */
export class AddProductPromotion1781000000000 implements MigrationInterface {
  name = 'AddProductPromotion1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "promoPrice" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "promoEndsAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "promoEndsAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "promoPrice"`,
    );
  }
}
