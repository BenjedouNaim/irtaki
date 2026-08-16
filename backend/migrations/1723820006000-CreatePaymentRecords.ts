import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePaymentRecords1723820006000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create payment_records table
        await queryRunner.query(`
            CREATE TABLE "payment_records" (
                "id" UUID PRIMARY KEY,
                "membership_id" UUID NOT NULL,
                "cycle_index" SMALLINT NOT NULL CONSTRAINT "DB-CHK-18" CHECK (cycle_index >= 0),
                "amount" NUMERIC(10,2) NOT NULL CONSTRAINT "DB-CHK-17" CHECK (amount = 30.00),
                "paid_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "recorded_by" UUID NOT NULL,
                "deleted_at" TIMESTAMPTZ,
                CONSTRAINT "fk_payment_records_membership" FOREIGN KEY ("membership_id") REFERENCES "memberships" ("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_payment_records_recorded_by" FOREIGN KEY ("recorded_by") REFERENCES "users" ("id") ON DELETE RESTRICT
            );
        `);

        // DB-UQ-06: One payment per membership cycle
        await queryRunner.query(`
            CREATE UNIQUE INDEX "DB-UQ-06" ON "payment_records" ("membership_id", "cycle_index") WHERE "deleted_at" IS NULL;
        `);

        // DB-IDX-08: Index for cycle/ledger lookups
        await queryRunner.query(`
            CREATE INDEX "DB-IDX-08" ON "payment_records" ("membership_id", "cycle_index");
        `);

        // Trigger DB-CHK-11: payment_records immutability except for deleted_at
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION check_payment_records_immutability()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.id <> OLD.id OR
                   NEW.membership_id <> OLD.membership_id OR
                   NEW.cycle_index <> OLD.cycle_index OR
                   NEW.amount <> OLD.amount OR
                   NEW.paid_at <> OLD.paid_at OR
                   NEW.recorded_by <> OLD.recorded_by THEN
                    RAISE EXCEPTION 'payment_records is fully immutable except for deleted_at';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER trg_payment_records_immutability
            BEFORE UPDATE ON "payment_records"
            FOR EACH ROW
            EXECUTE FUNCTION check_payment_records_immutability();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER trg_payment_records_immutability ON "payment_records";`);
        await queryRunner.query(`DROP FUNCTION check_payment_records_immutability();`);
        await queryRunner.query(`DROP INDEX "DB-IDX-08";`);
        await queryRunner.query(`DROP INDEX "DB-UQ-06";`);
        await queryRunner.query(`DROP TABLE "payment_records";`);
    }
}
