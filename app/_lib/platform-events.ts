import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import type { ActivityLogEntry, SendNotificationInput } from '@sovereignfs/sdk';

/**
 * Sends a notification to a user. Best-effort: a failure here (e.g. the
 * platform notification center being briefly unavailable) must never block
 * the action that triggered it — invite, publish — since those already
 * succeeded by the time we notify about them.
 *
 * `sdk.notifications.send` reads the calling plugin's id from an explicitly
 * passed Headers object (unlike sdk.activity.log, which reads request
 * headers internally) — omitting it silently attributes the notification
 * to "unknown" instead of Plainwrite.
 */
export async function notifyUser(input: SendNotificationInput): Promise<void> {
  try {
    await sdk.notifications.send(input, await headers());
  } catch {
    // See docblock — never let a notification failure surface to the user.
  }
}

/**
 * Records a project/publish activity event. Best-effort for the same reason
 * as notifyUser — activity logging must never block the action itself.
 */
export async function recordActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    await sdk.activity.log(entry);
  } catch {
    // See docblock — never let an activity-log failure surface to the user.
  }
}
