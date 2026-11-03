// Schedules are reminders, not permission to open/close a shift.
// Use WIB explicitly rather than the device's local timezone.
export function isShiftOverdue(type: string, openedAt: string | null, now = new Date()): boolean {
  if (!openedAt) return false;
  const opened = new Date(openedAt).getTime();
  if (!Number.isFinite(opened)) return false;
  const wib = new Date(opened + 7 * 60 * 60 * 1000);
  const morning = type.split(" - ")[0] === "Pagi";
  const night = type.split(" - ")[0] === "Malam";
  if (!morning && !night) return false;
  const dayOffset = night && wib.getUTCHours() >= 7 ? 1 : 0;
  const deadline = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + dayOffset,
    (morning ? 19 : 7) - 7);
  return now.getTime() >= deadline;
}
