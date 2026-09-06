import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ISS #135: `notification_log` (DBT-17) records the RECIPIENT and the
 * category but not the SUBJECT, so N-07's once-per-episode guard can only
 * dedup per recipient and a Teacher with two at-risk students in one window
 * hears about one of them.
 *
 * `subject_id` is polymorphic — a `memberships.id` for N-01/N-02/N-03/N-06/
 * N-07/N-08, a `join_requests.id` for N-04/N-05 — so it carries no FK, the
 * same shape `audit_entries.target_id` (DBT-18) already has in this schema.
 * Nullable, because DMS §7.2 makes the log write-once: rows written before
 * this migration keep the only value they can have.
 *
 * ⚠️ This column is an addition BEYOND DBD.md's ERD for DBT-17, which
 * defines six columns and does not contemplate a subject. It is authorised
 * by issue #135's own task list ("Add a nullable subject reference to
 * `notification_log` … with a migration"), which AGENTS §12 makes the work
 * order; `docs/` is read-only (AGENTS §2.5), so the DBD correction is raised
 * separately with the Product Owner and is NOT made here.
 */
export class AddSubjectToNotificationLog1723820101000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_log" ADD COLUMN "subject_id" UUID NULL;
    `);

    // The narrowed cadence lookup of SA §21 ("checked against existing
    // notification_log entries before dispatch, no new table needed"), now
    // asking (recipient, category, subject) bounded by dispatched_at. Its
    // leading columns are exactly `idx_notification_log_user_category`'s, so
    // the per-recipient probe N-06 still makes is served by it too.
    await queryRunner.query(`
      CREATE INDEX "idx_notification_log_user_category_subject"
        ON "notification_log" ("user_id", "category", "subject_id", "dispatched_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "idx_notification_log_user_category_subject";
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_log" DROP COLUMN "subject_id";
    `);
  }
}
