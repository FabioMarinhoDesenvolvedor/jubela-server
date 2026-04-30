import { MigrationInterface, QueryRunner } from 'typeorm';

export class New1777505303086 implements MigrationInterface {
  name = 'New1777505303086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD "checkout_url" character varying(500) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "checkout_url"`);
  }
}
