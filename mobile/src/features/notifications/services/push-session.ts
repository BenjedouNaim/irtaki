// Kept platform-neutral so the API/auth client never imports a native SDK on web.
let cleanup: () => Promise<void> = async () => {};
export function setPushCleanup(handler: () => Promise<void>): void {
  cleanup = handler;
}
export async function unregisterPushDevice(): Promise<void> {
  await cleanup();
}
