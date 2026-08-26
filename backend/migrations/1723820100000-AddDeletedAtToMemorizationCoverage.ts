import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToMemorizationCoverage1723820100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "memorization_coverage" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "memorization_coverage" DROP COLUMN "deleted_at";
    `);
  }
}
