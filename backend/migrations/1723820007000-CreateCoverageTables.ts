import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCoverageTables1723820007000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create memorization_coverage table (DBT-09)
        await queryRunner.query(`
            CREATE TABLE "memorization_coverage" (
                "id" UUID PRIMARY KEY,
                "membership_id" UUID NOT NULL,
                "ahzab_completed" SMALLINT NOT NULL DEFAULT 0 CONSTRAINT "DB-CHK-19" CHECK (ahzab_completed BETWEEN 0 AND 60),
                "last_memorized_ordinal" INTEGER,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "fk_memorization_coverage_membership" FOREIGN KEY ("membership_id") REFERENCES "memberships" ("id") ON DELETE RESTRICT
            );
        `);

        // DB-UQ-07: Strict 1:1 with memberships
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-07" ON "memorization_coverage" ("membership_id");
        `);

        // Create coverage_intervals table (DBT-10)
        await queryRunner.query(`
            CREATE TABLE "coverage_intervals" (
                "id" UUID PRIMARY KEY,
                "coverage_id" UUID NOT NULL,
                "start_ordinal" INTEGER NOT NULL,
                "end_ordinal" INTEGER NOT NULL,
                CONSTRAINT "fk_coverage_intervals_coverage" FOREIGN KEY ("coverage_id") REFERENCES "memorization_coverage" ("id") ON DELETE CASCADE,
                CONSTRAINT "DB-CHK-04" CHECK ("end_ordinal" >= "start_ordinal")
            );
        `);

        // DB-IDX-07: Index for merging intervals
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-07" ON "coverage_intervals" ("coverage_id", "start_ordinal");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "DB-IDX-07";`);
        await queryRunner.query(`DROP TABLE "coverage_intervals";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-07";`);
        await queryRunner.query(`DROP TABLE "memorization_coverage";`);
    }
}
