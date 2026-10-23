import { savedSessionSchema, type SavedSession } from '@felt/shared';

export function savedSession(code: string): SavedSession | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`felt.session.${code}`) ?? 'null',
    );
    const parsed = savedSessionSchema.safeParse(value);
    return parsed.success && parsed.data.code === code ? parsed.data : null;
  } catch {
    return null;
  }
}
export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(
      `felt.session.${session.code}`,
      JSON.stringify(session),
    );
  } catch {
    /* Reconnect still works in memory when storage is disabled. */
  }
}
export function forgetSession(code: string): void {
  try {
    sessionStorage.removeItem(`felt.session.${code}`);
  } catch {
    /* Storage may be disabled. */
  }
}
