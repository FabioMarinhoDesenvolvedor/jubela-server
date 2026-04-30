import { MigrationInterface, QueryRunner } from "typeorm";

export class New1777585372354 implements MigrationInterface {
    name = 'New1777585372354'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "phone_number"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "address"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee" ADD "address" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "phone_number" character varying(15) NOT NULL`);
    }

}
