import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffReassignedToAuditEntries1723820011000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_action_check";
      ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_action_check" CHECK (action IN ('ENROLLMENT_TOGGLED', 'GROUP_CREATED', 'LOGIN', 'STAFF_REASSIGNED'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_action_check";
      ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_action_check" CHECK (action IN ('ENROLLMENT_TOGGLED', 'GROUP_CREATED', 'LOGIN'));
    `);
  }
}
