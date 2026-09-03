export class GroupArchivedEvent {
  static readonly EVENT_NAME = 'group.archived';

  constructor(
    public readonly groupId: string,
    public readonly archivedAt: Date,
    /**
     * The `Pending` JoinRequests DS-07 auto-rejected in the same transaction
     * (FR-REQ-08). DMS §DE-10 has this event cascade DE-04, and N-04 goes to
     * one applicant per id — carrying them here keeps Notifications from
     * having to read another module's table to find out who to tell.
     */
    public readonly autoRejectedJoinRequestIds: readonly string[] = [],
  ) {}
}
