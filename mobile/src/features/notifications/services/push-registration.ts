export interface PushSession {
  userId: string;
  accessToken: string;
}
export interface StoredPushRegistration {
  userId: string;
  deviceId: string;
}
export interface PushRegistrationAdapter {
  permission(): Promise<boolean>;
  enable(enabled: boolean): Promise<void>;
  token(): Promise<string>;
  deleteToken(): Promise<void>;
  register(token: string, accessToken: string): Promise<{ id: string }>;
  unregister(id: string, accessToken: string): Promise<void>;
  load(): Promise<StoredPushRegistration | null>;
  save(value: StoredPushRegistration | null): Promise<void>;
}

/** Serializes account/token changes so a late registration cannot outlive logout. */
export class PushRegistrationManager {
  private revision = 0;
  private work: Promise<void> = Promise.resolve();
  private registration: StoredPushRegistration | null = null;
  private owner: PushSession | null = null;
  private loaded = false;

  constructor(private readonly adapter: PushRegistrationAdapter) {}

  sync(session: PushSession | null): Promise<void> {
    const revision = ++this.revision;
    this.work = this.work
      .catch(() => undefined)
      .then(async () => {
        if (revision !== this.revision) return;
        if (!this.loaded) {
          this.registration = await this.adapter.load();
          this.loaded = true;
        }
        if (this.registration && this.registration.userId !== session?.userId) {
          await this.remove();
        }
        if (!session) {
          // Also invalidates a token when the server registration response was lost.
          await this.disable();
          return;
        }
        this.owner = session;
        if (!(await this.adapter.permission())) {
          await this.remove();
          await this.disable();
          return;
        }
        if (revision !== this.revision) return;
        await this.adapter.enable(true);
        const token = await this.adapter.token();
        if (revision !== this.revision) return;
        const record = await this.adapter.register(token, session.accessToken);
        if (this.registration && this.registration.deviceId !== record.id) {
          try {
            await this.adapter.unregister(
              this.registration.deviceId,
              session.accessToken,
            );
          } catch {
            /* Old token is no longer used. */
          }
        }
        this.registration = { userId: session.userId, deviceId: record.id };
        await this.adapter.save(this.registration);
        // If logout arrived while POST was in flight, its queued sync removes this row.
      })
      .catch(() => {
        // Push is best effort. Retry on the next foreground/session/token change.
      });
    return this.work;
  }

  private async remove(): Promise<void> {
    const registration = this.registration;
    const owner = this.owner;
    if (registration && owner?.userId === registration.userId) {
      try {
        await this.adapter.unregister(registration.deviceId, owner.accessToken);
      } catch {
        /* Offline: invalidate native token below. */
      }
    }
    this.registration = null;
    this.owner = null;
    try {
      await this.adapter.save(null);
    } catch {
      /* Cleanup must still invalidate the native token if storage fails. */
    }
    await this.disable();
  }

  private async disable(): Promise<void> {
    try {
      await this.adapter.enable(false);
    } catch {
      /* Best effort. */
    }
    try {
      await this.adapter.deleteToken();
    } catch {
      /* No token/offline. */
    }
  }
}
