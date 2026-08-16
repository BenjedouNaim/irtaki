import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNotificationTables1723820009000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Create notification_categories table (DBT-15)
        await queryRunner.query(`
            CREATE TABLE "notification_categories" (
                "code" VARCHAR PRIMARY KEY,
                "description" VARCHAR NOT NULL,
                "is_mutable" BOOLEAN NOT NULL
            );
        `);

        // 2. Create device_tokens table (DBT-14)
        await queryRunner.query(`
            CREATE TABLE "device_tokens" (
                "id" UUID PRIMARY KEY,
                "user_id" UUID NOT NULL,
                "token" VARCHAR NOT NULL UNIQUE,
                "platform" VARCHAR NOT NULL CHECK (platform IN ('iOS', 'Android')),
                "registered_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "invalidated_at" TIMESTAMPTZ,
                CONSTRAINT "fk_device_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
            );
        `);

        // Index on device_tokens.user_id
        await queryRunner.query(`
            CREATE INDEX "idx_device_tokens_user" ON "device_tokens" ("user_id");
        `);

        // 3. Create notification_preferences table (DBT-16)
        await queryRunner.query(`
            CREATE TABLE "notification_preferences" (
                "id" UUID PRIMARY KEY,
                "user_id" UUID NOT NULL,
                "category" VARCHAR NOT NULL,
                "muted" BOOLEAN NOT NULL DEFAULT false,
                CONSTRAINT "fk_notification_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_notification_preferences_category" FOREIGN KEY ("category") REFERENCES "notification_categories" ("code") ON DELETE RESTRICT
            );
        `);

        // DB-UQ-10 / DB-IDX-09: One preference category per user
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-10" ON "notification_preferences" ("user_id", "category");
        `);

        // 4. Create notification_log table (DBT-17)
        await queryRunner.query(`
            CREATE TABLE "notification_log" (
                "id" UUID PRIMARY KEY,
                "user_id" UUID NOT NULL,
                "category" VARCHAR NOT NULL,
                "dispatched_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "outcome" VARCHAR NOT NULL CHECK (outcome IN ('Sent', 'Failed', 'Suppressed')),
                "transport_reference" VARCHAR,
                CONSTRAINT "fk_notification_log_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_notification_log_category" FOREIGN KEY ("category") REFERENCES "notification_categories" ("code") ON DELETE RESTRICT
            );
        `);

        // Index on notification_log user and category
        await queryRunner.query(`
            CREATE INDEX "idx_notification_log_user_category" ON "notification_log" ("user_id", "category");
        `);

        // Trigger DB-CHK-09: notification_preferences mutability check vs category is_mutable
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_notification_preferences_mutability()
            RETURNS TRIGGER AS $$
            DECLARE
                cat_mutable BOOLEAN;
            BEGIN
                SELECT is_mutable INTO cat_mutable FROM "notification_categories" WHERE code = NEW.category;
                IF NEW.muted = true AND cat_mutable = false THEN
                    RAISE EXCEPTION 'Category % is account-critical and cannot be muted', NEW.category;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_notification_preferences_mutability
            BEFORE INSERT OR UPDATE ON "notification_preferences"
            FOR EACH ROW
            EXECUTE FUNCTION check_notification_preferences_mutability();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER trg_notification_preferences_mutability ON "notification_preferences";`);
        await queryRunner.query(`DROP FUNCTION check_notification_preferences_mutability();`);
        await queryRunner.query(`DROP INDEX "idx_notification_log_user_category";`);
        await queryRunner.query(`DROP TABLE "notification_log";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-10";`);
        await queryRunner.query(`DROP TABLE "notification_preferences";`);
        await queryRunner.query(`DROP INDEX "idx_device_tokens_user";`);
        await queryRunner.query(`DROP TABLE "device_tokens";`);
        await queryRunner.query(`DROP TABLE "notification_categories";`);
    }
}
