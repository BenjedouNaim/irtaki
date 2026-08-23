export class JoinRequestSubmittedEvent {
  public static readonly EVENT_NAME = 'join-request.submitted';

  constructor(
    public readonly joinRequestId: string,
    public readonly groupId: string,
    public readonly applicantId: string,
    public readonly score: number,
    public readonly submittedAt: Date,
  ) {}
}
