import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEnrollmentTables1723820003000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Create join_requests table
        await queryRunner.query(`
            CREATE TABLE "join_requests" (
                "id" UUID PRIMARY KEY,
                "user_id" UUID NOT NULL,
                "group_id" UUID NOT NULL,
                "full_name" VARCHAR NOT NULL,
                "gender" VARCHAR NOT NULL CHECK (gender IN ('Male', 'Female')),
                "age" INTEGER NOT NULL CHECK (age > 0),
                "phone_number" VARCHAR NOT NULL,
                "occupation" VARCHAR NOT NULL,
                "city" VARCHAR NOT NULL,
                "memorized_hizb_count" SMALLINT NOT NULL CHECK (memorized_hizb_count BETWEEN 5 AND 60),
                "tajweed_level" VARCHAR NOT NULL CHECK (tajweed_level IN ('Beginner', 'Intermediate', 'Advanced')),
                "studied_tajweed_theory" BOOLEAN NOT NULL,
                "studied_qalun" BOOLEAN NOT NULL,
                "fee_agreement" BOOLEAN NOT NULL CHECK (fee_agreement = true),
                "program_goal" VARCHAR NOT NULL CHECK (program_goal = 'Memorization'),
                "score" NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 9.17 AND 100.00),
                "status" VARCHAR NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Accepted', 'Rejected')),
                "resolution_source" VARCHAR,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "reviewed_at" TIMESTAMPTZ,
                "reviewed_by" UUID,
                "deleted_at" TIMESTAMPTZ,
                CONSTRAINT "fk_join_requests_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_join_requests_group" FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_join_requests_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE RESTRICT
            );
        `);

        // DB-UQ-03: One pending join request per user
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-03" ON "join_requests" ("user_id") WHERE "status" = 'Pending';
        `);

        // DB-IDX-05: Queue sorting index
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-05" ON "join_requests" ("group_id", "status", "score" DESC, "created_at" ASC);
        `);

        // 2. Create join_request_ahzab table
        await queryRunner.query(`
            CREATE TABLE "join_request_ahzab" (
                "join_request_id" UUID NOT NULL,
                "hizb_number" SMALLINT NOT NULL CHECK (hizb_number BETWEEN 1 AND 60),
                PRIMARY KEY ("join_request_id", "hizb_number"),
                CONSTRAINT "fk_join_request_ahzab_parent" FOREIGN KEY ("join_request_id") REFERENCES "join_requests" ("id") ON DELETE CASCADE
            );
        `);

        // 3. Create memberships table
        await queryRunner.query(`
            CREATE TABLE "memberships" (
                "id" UUID PRIMARY KEY,
                "user_id" UUID NOT NULL,
                "group_id" UUID NOT NULL,
                "join_request_id" UUID,
                "state" VARCHAR NOT NULL DEFAULT 'Active' CHECK (state IN ('Active', 'Terminated')),
                "started_at" DATE NOT NULL,
                "ended_at" DATE,
                "ended_by" UUID,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "fk_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_memberships_group" FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_memberships_join_request" FOREIGN KEY ("join_request_id") REFERENCES "join_requests" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_memberships_ended_by" FOREIGN KEY ("ended_by") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "DB-CHK-01" CHECK ("ended_at" >= "started_at")
            );
        `);

        // DB-UQ-02: One active membership per student
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-02" ON "memberships" ("user_id") WHERE "state" = 'Active';
        `);

        // DB-UQ-09: One membership per join request
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-09" ON "memberships" ("join_request_id") WHERE "join_request_id" IS NOT NULL;
        `);

        // Indexes for memberships
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-03" ON "memberships" ("group_id", "state");
        `);
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-04" ON "memberships" ("group_id", "started_at", "ended_at");
        `);

        // Trigger DB-CHK-10: join_requests immutability
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_join_requests_immutability()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.id <> OLD.id OR
                   NEW.user_id <> OLD.user_id OR
                   NEW.group_id <> OLD.group_id OR
                   NEW.full_name <> OLD.full_name OR
                   NEW.gender <> OLD.gender OR
                   NEW.age <> OLD.age OR
                   NEW.phone_number <> OLD.phone_number OR
                   NEW.occupation <> OLD.occupation OR
                   NEW.city <> OLD.city OR
                   NEW.memorized_hizb_count <> OLD.memorized_hizb_count OR
                   NEW.tajweed_level <> OLD.tajweed_level OR
                   NEW.studied_tajweed_theory <> OLD.studied_tajweed_theory OR
                   NEW.studied_qalun <> OLD.studied_qalun OR
                   NEW.fee_agreement <> OLD.fee_agreement OR
                   NEW.program_goal <> OLD.program_goal OR
                   NEW.score <> OLD.score OR
                   NEW.created_at <> OLD.created_at THEN
                    RAISE EXCEPTION 'Only status, reviewed_at, reviewed_by, resolution_source, and deleted_at can be mutated on join_requests';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_join_requests_immutability
            BEFORE UPDATE ON "join_requests"
            FOR EACH ROW
            EXECUTE FUNCTION check_join_requests_immutability();
        `);

        // Trigger DB-CHK-12: join_requests gender match group gender on insert
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_join_requests_gender_match()
            RETURNS TRIGGER AS $$
            DECLARE
                grp_gender VARCHAR;
            BEGIN
                SELECT gender INTO grp_gender FROM "groups" WHERE id = NEW.group_id;
                IF NEW.gender <> grp_gender THEN
                    RAISE EXCEPTION 'JoinRequest gender must match target Group gender';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_join_requests_gender_match
            BEFORE INSERT ON "join_requests"
            FOR EACH ROW
            EXECUTE FUNCTION check_join_requests_gender_match();
        `);
    }

    public async down(queryRunner: Promise<any> | any): Promise<void> {
        const qr = queryRunner;
        await qr.query(`DROP TRIGGER trg_join_requests_gender_match ON "join_requests";`);
        await qr.query(`DROP FUNCTION check_join_requests_gender_match();`);
        await qr.query(`DROP TRIGGER trg_join_requests_immutability ON "join_requests";`);
        await qr.query(`DROP FUNCTION check_join_requests_immutability();`);
        await qr.query(`DROP INDEX "DB-IDX-04";`);
        await qr.query(`DROP INDEX "DB-IDX-03";`);
        await qr.query(`DROP INDEX "DB-UQ-09";`);
        await qr.query(`DROP INDEX "DB-UQ-02";`);
        await qr.query(`DROP TABLE "memberships";`);
        await qr.query(`DROP TABLE "join_request_ahzab";`);
        await qr.query(`DROP INDEX "DB-IDX-05";`);
        await qr.query(`DROP INDEX "DB-UQ-03";`);
        await qr.query(`DROP TABLE "join_requests";`);
    }
}
