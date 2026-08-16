import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateQuranReferenceTables1723820008000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create surahs table (DBT-11)
        await queryRunner.query(`
            CREATE TABLE "surahs" (
                "number" SMALLINT PRIMARY KEY CHECK (number BETWEEN 1 AND 114),
                "name_ar" VARCHAR NOT NULL,
                "ayah_count" SMALLINT NOT NULL,
                "ordinal_offset" INTEGER NOT NULL
            );
        `);

        // Create hizb_boundaries table (DBT-12)
        await queryRunner.query(`
            CREATE TABLE "hizb_boundaries" (
                "hizb_number" SMALLINT PRIMARY KEY CHECK (hizb_number BETWEEN 1 AND 60),
                "start_ordinal" INTEGER NOT NULL,
                "end_ordinal" INTEGER NOT NULL,
                "start_surah" SMALLINT NOT NULL,
                "start_ayah" SMALLINT NOT NULL,
                "end_surah" SMALLINT NOT NULL,
                "end_ayah" SMALLINT NOT NULL,
                CONSTRAINT "fk_hizb_boundaries_start_surah" FOREIGN KEY ("start_surah") REFERENCES "surahs" ("number") ON DELETE RESTRICT,
                CONSTRAINT "fk_hizb_boundaries_end_surah" FOREIGN KEY ("end_surah") REFERENCES "surahs" ("number") ON DELETE RESTRICT
            );
        `);

        // Create reference_data_version table (DBT-13)
        await queryRunner.query(`
            CREATE TABLE "reference_data_version" (
                "id" BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
                "dataset_version" VARCHAR NOT NULL,
                "loaded_at" TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "reference_data_version";`);
        await queryRunner.query(`DROP TABLE "hizb_boundaries";`);
        await queryRunner.query(`DROP TABLE "surahs";`);
    }
}
