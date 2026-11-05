export type SalesReadWindow = { start: Date; end: Date };
export type SalesReadView = "pos" | "reports";

export type SalesReadScopeInput = {
  view: SalesReadView;
  reportStartDate?: string;
  reportEndDate?: string;
  shiftOpen?: boolean;
  shiftStartTime?: string | null;
  shiftLogicalDate?: string;
  now?: Date;
};

function logicalDayStart(date: Date): Date {
  const start = new Date(date);
  if (start.getHours() < 6) start.setDate(start.getDate() - 1);
  start.setHours(6, 0, 0, 0);
  return start;
}

function selectedDayWindow(day: string): SalesReadWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date, 6, 0, 0, 0);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== date) return null;
  const end = new Date(year, month - 1, date + 1, 6, 0, 0, -1);
  return { start, end };
}

export function makeSalesReadWindows(input: SalesReadScopeInput): SalesReadWindow[] {
  const now = input.now ? new Date(input.now) : new Date();
  const todayStart = logicalDayStart(now);

  if (input.view === "reports") {
    const customStart = input.reportStartDate ? selectedDayWindow(input.reportStartDate) : null;
    const customEnd = input.reportEndDate ? selectedDayWindow(input.reportEndDate) : null;
    if (customStart && customEnd) {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const overlapWithTodayCards = customStart.start <= now && customEnd.end >= yesterdayStart;
      if (overlapWithTodayCards) {
        return [{
          start: customStart.start < yesterdayStart ? customStart.start : yesterdayStart,
          end: customEnd.end > now ? customEnd.end : now,
        }];
      }
      return [
        { start: customStart.start, end: customEnd.end },
        { start: yesterdayStart, end: now },
      ];
    }

    const start = new Date(todayStart);
    start.setDate(start.getDate() - 3);
    return [{ start, end: now }];
  }

  const shiftStart = input.shiftOpen && input.shiftStartTime
    ? new Date(input.shiftStartTime)
    : null;
  const storedShiftDay = input.shiftLogicalDate ? selectedDayWindow(input.shiftLogicalDate) : null;
  const start = shiftStart && Number.isFinite(shiftStart.getTime())
    ? shiftStart
    : storedShiftDay?.start || todayStart;
  return [{ start, end: now }];
}
