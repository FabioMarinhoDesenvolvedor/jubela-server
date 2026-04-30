import { MigrationInterface, QueryRunner } from "typeorm";

export class New1777585900340 implements MigrationInterface {
    name = 'New1777585900340'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee" DROP CONSTRAINT "UQ_cc5bc3cbcb7312fbc898749c5bc"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "cpf"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee" ADD "cpf" character varying(14) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "employee" ADD CONSTRAINT "UQ_cc5bc3cbcb7312fbc898749c5bc" UNIQUE ("cpf")`);
    }

}
