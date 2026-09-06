import type { MembershipSuppressionContext } from './notification-suppression';

export const NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY = Symbol(
  'NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY',
);

/** One live `device_tokens` row as the transport needs it (E-09, DBT-14). */
export interface LiveDeviceToken {
  id: string;
  token: string;
}

/**
 * One auto-rejected JoinRequest reduced to what N-04 needs: the subject the
 * notification is about and the Applicant it goes to (SAS §22.2).
 */
export interface JoinRequestApplicant {
  joinRequestId: string;
  userId: string;
}

/**
 * The reads `NotificationService` itself performs while walking SA §21's
 * sequence. They live in the Notifications module's OWN infrastructure —
 * the module subscribes to the other modules' events and is never called
 * into (SA §11), so it may not inject their repositories to resolve a
 * recipient or a suppression condition; it issues its own parameterised
 * indexed queries instead, the same posture the Performance module takes
 * with `GroupPerformanceRepository` (TS §15.2).
 */
export interface INotificationDispatchContextRepository {
  /**
   * §22.3 "no valid device token exists": the recipient's live tokens —
   * `invalidated_at IS NULL` — in one indexed read.
   */
  findLiveDeviceTokens(userId: string): Promise<LiveDeviceToken[]>;

  /** UC-15 E2 / SAS §22.5: mark a provider-rejected token invalidated. */
  invalidateDeviceToken(tokenId: string): Promise<void>;

  /**
   * `notification_preferences.muted` for one (user, category), merged with
   * `notification_categories.is_mutable` — R-15's "absent = unmuted" and
   * BR-61's "account-critical is never mutable" resolved in the query.
   * Null when the category code is not in the DBT-15 catalogue.
   */
  findPreference(
    userId: string,
    category: string,
  ): Promise<{ isMutable: boolean; muted: boolean } | null>;

  /**
   * §22.3's four membership-context conditions for one membership, in the
   * student's own timezone (T-01). Null when the membership does not exist.
   */
  findMembershipSuppressionContext(
    membershipId: string,
    now: Date,
  ): Promise<MembershipSuppressionContext | null>;

  /** The `users.id` holding a membership — N-08's recipient (DE-09). */
  findMembershipHolderUserId(membershipId: string): Promise<string | null>;

  /** The `groups.assistant_id` of a group — N-05's recipient (DE-01). */
  findGroupAssistantUserId(groupId: string): Promise<string | null>;

  /**
   * The Applicants behind the JoinRequests DE-10 names as auto-rejected —
   * N-04's recipients on DS-07's archival path (issue #133).
   *
   * `GroupArchivedEvent` carries the ids that FR-REQ-08's cascade rejected
   * but not who they belong to, and SA §11 gives Notifications no inbound
   * edge to the Enrollment module, so the user ids are resolved here, by
   * this module's own read of `join_requests`, exactly as N-05's assistant
   * and N-08's holder already are. An empty id list is answered without
   * touching the database.
   */
  findJoinRequestApplicants(
    joinRequestIds: readonly string[],
  ): Promise<JoinRequestApplicant[]>;
}
