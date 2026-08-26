export class MembershipTerminatedEvent {
  public static readonly EVENT_NAME = 'membership.terminated';

  constructor(
    public readonly membershipId: string,
    public readonly endedBy: string,
    public readonly endedAt: string,
  ) {}
}
