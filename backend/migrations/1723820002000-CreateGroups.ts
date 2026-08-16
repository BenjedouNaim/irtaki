import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGroups1723820002000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create groups table
        await queryRunner.query(`
            CREATE TABLE "groups" (
                "id" UUID PRIMARY KEY,
                "name" VARCHAR NOT NULL UNIQUE,
                "gender" VARCHAR NOT NULL CHECK (gender IN ('Male', 'Female')),
                "recitation_day" SMALLINT NOT NULL CHECK (recitation_day BETWEEN 1 AND 7),
                "enrollment_status" VARCHAR NOT NULL DEFAULT 'Open' CHECK (enrollment_status IN ('Open', 'Closed')),
                "lifecycle_state" VARCHAR NOT NULL DEFAULT 'Active' CHECK (lifecycle_state IN ('Active', 'Archived')),
                "archived_at" TIMESTAMPTZ,
                "teacher_id" UUID NOT NULL,
                "assistant_id" UUID NOT NULL,
                "created_by" UUID NOT NULL,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "fk_groups_teacher" FOREIGN KEY ("teacher_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_groups_assistant" FOREIGN KEY ("assistant_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_groups_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT
            );
        `);

        // Index on teacher_id and assistant_id
        await queryRunner.query(`CREATE INDEX "idx_groups_teacher_id" ON "groups" ("teacher_id");`);
        await queryRunner.query(`CREATE INDEX "idx_groups_assistant_id" ON "groups" ("assistant_id");`);

        // Index for open group discovery (DB-IDX-06)
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-06" ON "groups" ("gender", "enrollment_status", "lifecycle_state");
        `);

        // Trigger for recitation_day immutability (DB-CHK-06)
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_groups_recitation_day_immutability()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.recitation_day <> OLD.recitation_day THEN
                    RAISE EXCEPTION 'recitation_day is immutable after creation';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_groups_recitation_day_immutability
            BEFORE UPDATE ON "groups"
            FOR EACH ROW
            EXECUTE FUNCTION check_groups_recitation_day_immutability();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER trg_groups_recitation_day_immutability ON "groups";`);
        await queryRunner.query(`DROP FUNCTION check_groups_recitation_day_immutability();`);
        await queryRunner.query(`DROP INDEX "DB-IDX-06";`);
        await queryRunner.query(`DROP INDEX "idx_groups_assistant_id";`);
        await queryRunner.query(`DROP INDEX "idx_groups_teacher_id";`);
        await queryRunner.query(`DROP TABLE "groups";`);
    }
}
