export class JoinRequestAcceptedEvent {
  public static readonly EVENT_NAME = 'join-request.accepted';

  constructor(
    public readonly joinRequestId: string,
    public readonly membershipId: string,
    public readonly applicantUserId: string,
  ) {}
}
