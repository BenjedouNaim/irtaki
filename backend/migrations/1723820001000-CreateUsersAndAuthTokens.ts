import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsersAndAuthTokens1723820001000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create users table
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" UUID PRIMARY KEY,
                "email" VARCHAR NOT NULL,
                "password_hash" VARCHAR NOT NULL,
                "role" VARCHAR NOT NULL DEFAULT 'User' CHECK (role IN ('Admin', 'User', 'Student', 'Teacher', 'Assistant')),
                "full_name" VARCHAR,
                "gender" VARCHAR CHECK (gender IN ('Male', 'Female')),
                "timezone" VARCHAR NOT NULL,
                "must_change_password" BOOLEAN NOT NULL DEFAULT false,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        `);

        // Unique email index (DB-UQ-01)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-01" ON "users" ("email");
        `);

        // Single Admin constraint (DB-UQ-08)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-08" ON "users" ("role") WHERE "role" = 'Admin';
        `);

        // Create auth_tokens table (DBT-19)
        await queryRunner.query(`
            CREATE TABLE "auth_tokens" (
                "id" UUID PRIMARY KEY,
                "user_id" UUID NOT NULL,
                "token_hash" VARCHAR NOT NULL,
                "purpose" VARCHAR NOT NULL CHECK (purpose IN ('refresh', 'password_reset')),
                "device_token" VARCHAR,
                "issued_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMPTZ NOT NULL,
                "revoked_at" TIMESTAMPTZ,
                "replaced_by" UUID,
                CONSTRAINT "fk_auth_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_auth_tokens_replaced_by" FOREIGN KEY ("replaced_by") REFERENCES "auth_tokens" ("id") ON DELETE SET NULL
            );
        `);

        // Index on user_id for faster lookup
        await queryRunner.query(`
            CREATE INDEX "idx_auth_tokens_user_id" ON "auth_tokens" ("user_id");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "auth_tokens";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-08";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-01";`);
        await queryRunner.query(`DROP TABLE "users";`);
    }
}
