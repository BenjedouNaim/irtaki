import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditEntries1723820010000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create audit_entries table (DBT-18)
        await queryRunner.query(`
            CREATE TABLE "audit_entries" (
                "id" UUID PRIMARY KEY,
                "actor_id" UUID NOT NULL,
                "action" VARCHAR NOT NULL CHECK (action IN ('ENROLLMENT_TOGGLED', 'GROUP_CREATED', 'LOGIN')),
                "target_type" VARCHAR,
                "target_id" UUID,
                "previous_value" JSONB,
                "new_value" JSONB,
                "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "fk_audit_entries_actor" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT
            );
        `);

        // Index for querying logs (actor_id, occurred_at)
        await queryRunner.query(`
            CREATE INDEX "idx_audit_entries_actor_occurred" ON "audit_entries" ("actor_id", "occurred_at");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_audit_entries_actor_occurred";`);
        await queryRunner.query(`DROP TABLE "audit_entries";`);
    }
}
