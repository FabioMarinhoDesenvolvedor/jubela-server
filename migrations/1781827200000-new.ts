import { MigrationInterface, QueryRunner } from 'typeorm';

export class New1781827200000 implements MigrationInterface {
  name = 'New1781827200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ALTER COLUMN "description" TYPE character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product" ALTER COLUMN "description" TYPE character varying(255)`,
    );
  }
}
