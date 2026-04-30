import { MigrationInterface, QueryRunner } from 'typeorm';

export class New1777591822941 implements MigrationInterface {
  name = 'New1777591822941';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ALTER COLUMN "checkout_url" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ALTER COLUMN "checkout_url" SET NOT NULL`,
    );
  }
}
