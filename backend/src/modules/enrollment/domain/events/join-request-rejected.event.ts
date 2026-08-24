export class JoinRequestRejectedEvent {
  public static readonly EVENT_NAME = 'join-request.rejected';

  constructor(
    public readonly joinRequestId: string,
    public readonly applicantUserId: string,
  ) {}
}
