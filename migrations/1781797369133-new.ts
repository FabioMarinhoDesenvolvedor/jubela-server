import { MigrationInterface, QueryRunner } from "typeorm";

export class New1781797369133 implements MigrationInterface {
    name = 'New1781797369133'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "product" ADD "description" character varying(1000) NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "product" ADD "description" character varying(600) NOT NULL`);
    }

}
