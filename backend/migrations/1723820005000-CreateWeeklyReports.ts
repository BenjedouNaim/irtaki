import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWeeklyReports1723820005000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create weekly_reports table
        await queryRunner.query(`
            CREATE TABLE "weekly_reports" (
                "id" UUID PRIMARY KEY,
                "membership_id" UUID NOT NULL,
                "week_start" DATE NOT NULL,
                "week_end" DATE NOT NULL,
                "expected_days" SMALLINT NOT NULL CONSTRAINT "DB-CHK-05" CHECK (expected_days BETWEEN 0 AND 6),
                "missed_daily_reports" SMALLINT NOT NULL,
                "missed_daily_memorization" SMALLINT NOT NULL,
                "missed_daily_revision" SMALLINT NOT NULL,
                "missed_50_repetitions" SMALLINT NOT NULL,
                "missed_single_session" SMALLINT NOT NULL,
                "attended_recitation_call" BOOLEAN NOT NULL DEFAULT false,
                "state" VARCHAR NOT NULL DEFAULT 'Open' CHECK (state IN ('Open', 'Finalised')),
                "finalised_at" TIMESTAMPTZ,
                "finalised_by" UUID,
                "deleted_at" TIMESTAMPTZ,
                CONSTRAINT "fk_weekly_reports_membership" FOREIGN KEY ("membership_id") REFERENCES "memberships" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_weekly_reports_finalised_by" FOREIGN KEY ("finalised_by") REFERENCES "users" ("id") ON DELETE RESTRICT
            );
        `);

        // DB-UQ-05: One weekly report per student per week
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-05" ON "weekly_reports" ("membership_id", "week_start") WHERE "deleted_at" IS NULL;
        `);

        // DB-IDX-02: Index for performance calculations
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-02" ON "weekly_reports" ("membership_id", "week_start");
        `);

        // Trigger DB-CHK-08: weekly_reports state-aware immutability trigger
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_weekly_reports_immutability()
            RETURNS TRIGGER AS $$
            BEGIN
                IF OLD.state = 'Finalised' THEN
                    IF NEW.id <> OLD.id OR
                       NEW.membership_id <> OLD.membership_id OR
                       NEW.week_start <> OLD.week_start OR
                       NEW.week_end <> OLD.week_end OR
                       NEW.expected_days <> OLD.expected_days OR
                       NEW.missed_daily_reports <> OLD.missed_daily_reports OR
                       NEW.missed_daily_memorization <> OLD.missed_daily_memorization OR
                       NEW.missed_daily_revision <> OLD.missed_daily_revision OR
                       NEW.missed_50_repetitions <> OLD.missed_50_repetitions OR
                       NEW.missed_single_session <> OLD.missed_single_session OR
                       NEW.attended_recitation_call <> OLD.attended_recitation_call OR
                       NEW.state <> OLD.state OR
                       NEW.finalised_at IS DISTINCT FROM OLD.finalised_at OR
                       NEW.finalised_by IS DISTINCT FROM OLD.finalised_by THEN
                        RAISE EXCEPTION 'weekly_reports in Finalised state is fully immutable except for deleted_at';
                    END IF;
                ELSIF OLD.state = 'Open' THEN
                    IF NEW.id <> OLD.id OR
                       NEW.membership_id <> OLD.membership_id OR
                       NEW.week_start <> OLD.week_start OR
                       NEW.week_end <> OLD.week_end OR
                       NEW.expected_days <> OLD.expected_days OR
                       NEW.missed_daily_reports <> OLD.missed_daily_reports OR
                       NEW.missed_daily_memorization <> OLD.missed_daily_memorization OR
                       NEW.missed_daily_revision <> OLD.missed_daily_revision OR
                       NEW.missed_50_repetitions <> OLD.missed_50_repetitions OR
                       NEW.missed_single_session <> OLD.missed_single_session THEN
                        RAISE EXCEPTION 'Only attended_recitation_call, state, finalised_at, finalised_by, and deleted_at can be mutated when weekly_reports is Open';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_weekly_reports_immutability
            BEFORE UPDATE ON "weekly_reports"
            FOR EACH ROW
            EXECUTE FUNCTION check_weekly_reports_immutability();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER trg_weekly_reports_immutability ON "weekly_reports";`);
        await queryRunner.query(`DROP FUNCTION check_weekly_reports_immutability();`);
        await queryRunner.query(`DROP INDEX "DB-IDX-02";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-05";`);
        await queryRunner.query(`DROP TABLE "weekly_reports";`);
    }
}
