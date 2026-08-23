export class GroupArchivedEvent {
  static readonly EVENT_NAME = 'group.archived';

  constructor(
    public readonly groupId: string,
    public readonly archivedAt: Date,
  ) {}
}
