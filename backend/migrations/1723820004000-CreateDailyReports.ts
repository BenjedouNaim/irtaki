import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDailyReports1723820004000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create daily_reports table
        await queryRunner.query(`
            CREATE TABLE "daily_reports" (
                "id" UUID PRIMARY KEY,
                "membership_id" UUID NOT NULL,
                "report_date" DATE NOT NULL,
                "type" VARCHAR NOT NULL CHECK (type IN ('Normal', 'Absent', 'Revision')),
                "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "submitted_timezone" VARCHAR NOT NULL,
                "no_memorization_today" BOOLEAN,
                "memo_from_ordinal" INTEGER,
                "memo_to_ordinal" INTEGER,
                "memo_time_from" TIME,
                "memo_time_to" TIME,
                "completed_50_repetitions" BOOLEAN,
                "repetitions_in_single_session" BOOLEAN,
                "no_revision_today" BOOLEAN,
                "rev_from_ordinal" INTEGER,
                "rev_to_ordinal" INTEGER,
                "rev_time_from" TIME,
                "rev_time_to" TIME,
                "read_tafsir" BOOLEAN,
                "absence_reason" VARCHAR CHECK (absence_reason IN ('Sick', 'Studying', 'Other')),
                "deleted_at" TIMESTAMPTZ,
                CONSTRAINT "fk_daily_reports_membership" FOREIGN KEY ("membership_id") REFERENCES "memberships" ("id") ON DELETE RESTRICT,
                CONSTRAINT "DB-CHK-02" CHECK ("memo_from_ordinal" IS NULL OR "memo_to_ordinal" IS NULL OR "memo_to_ordinal" >= "memo_from_ordinal"),
                CONSTRAINT "DB-CHK-03" CHECK ("rev_from_ordinal" IS NULL OR "rev_to_ordinal" IS NULL OR "rev_to_ordinal" >= "rev_from_ordinal")
            );
        `);

        // DB-UQ-04: One daily report per student per day
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-04" ON "daily_reports" ("membership_id", "report_date") WHERE "deleted_at" IS NULL;
        `);

        // DB-IDX-01: Index for queries/weekly aggregation
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-01" ON "daily_reports" ("membership_id", "report_date");
        `);

        // DB-IDX-11: Admin recovery view
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-11" ON "daily_reports" ("membership_id", "report_date") WHERE "deleted_at" IS NOT NULL;
        `);

        // Trigger DB-CHK-07: daily_reports immutability except for deleted_at
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_daily_reports_immutability()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.id <> OLD.id OR
                   NEW.membership_id <> OLD.membership_id OR
                   NEW.report_date <> OLD.report_date OR
                   NEW.type <> OLD.type OR
                   NEW.submitted_at <> OLD.submitted_at OR
                   NEW.submitted_timezone <> OLD.submitted_timezone OR
                   NEW.no_memorization_today IS DISTINCT FROM OLD.no_memorization_today OR
                   NEW.memo_from_ordinal IS DISTINCT FROM OLD.memo_from_ordinal OR
                   NEW.memo_to_ordinal IS DISTINCT FROM OLD.memo_to_ordinal OR
                   NEW.memo_time_from IS DISTINCT FROM OLD.memo_time_from OR
                   NEW.memo_time_to IS DISTINCT FROM OLD.memo_time_to OR
                   NEW.completed_50_repetitions IS DISTINCT FROM OLD.completed_50_repetitions OR
                   NEW.repetitions_in_single_session IS DISTINCT FROM OLD.repetitions_in_single_session OR
                   NEW.no_revision_today IS DISTINCT FROM OLD.no_revision_today OR
                   NEW.rev_from_ordinal IS DISTINCT FROM OLD.rev_from_ordinal OR
                   NEW.rev_to_ordinal IS DISTINCT FROM OLD.rev_to_ordinal OR
                   NEW.rev_time_from IS DISTINCT FROM OLD.rev_time_from OR
                   NEW.rev_time_to IS DISTINCT FROM OLD.rev_time_to OR
                   NEW.read_tafsir IS DISTINCT FROM OLD.read_tafsir OR
                   NEW.absence_reason IS DISTINCT FROM OLD.absence_reason THEN
                    RAISE EXCEPTION 'daily_reports is fully immutable except for deleted_at';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_daily_reports_immutability
            BEFORE UPDATE ON "daily_reports"
            FOR EACH ROW
            EXECUTE FUNCTION check_daily_reports_immutability();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER trg_daily_reports_immutability ON "daily_reports";`);
        await queryRunner.query(`DROP FUNCTION check_daily_reports_immutability();`);
        await queryRunner.query(`DROP INDEX "DB-IDX-11";`);
        await queryRunner.query(`DROP INDEX "DB-IDX-01";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-04";`);
        await queryRunner.query(`DROP TABLE "daily_reports";`);
    }
}
