const HHMM_REGEX = /^(\d{2}):(\d{2})$/;

export const MINUTES_PER_DAY = 1440;

/**
 * Parses a strict 24-hour "HH:MM" string (00:00 - 23:59) into integer minutes since 00:00.
 */
export function parseTimeToMinutes(timeStr: string): number {
  const trimmed = timeStr.trim();
  const match = HHMM_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid time format "${timeStr}". Expected HH:MM.`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Time out of range "${timeStr}". Hours must be 00-23 and minutes 00-59.`);
  }
  return hours * 60 + minutes;
}

/**
 * Parses a time string that may allow "24:00" as end-of-day closure bound (1440 minutes).
 */
export function parseClosureTimeToMinutes(timeStr: string): number {
  const trimmed = timeStr.trim();
  if (trimmed === '24:00') {
    return MINUTES_PER_DAY;
  }
  return parseTimeToMinutes(trimmed);
}

/**
 * Formats integer minutes since 00:00 back to HH:MM.
 * If minutes >= 1440 (midnight spillover caused by severe cascade delays), appends "+1d" (or "+Nd").
 */
export function formatMinutesToTime(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new Error(`Invalid minutes value: ${totalMinutes}`);
  }
  const rounded = Math.trunc(totalMinutes);
  const daysOffset = Math.floor(rounded / MINUTES_PER_DAY);
  const minsOfDay = rounded % MINUTES_PER_DAY;
  const hours = Math.floor(minsOfDay / 60);
  const mins = minsOfDay % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  return daysOffset > 0 ? `${hh}:${mm}+${daysOffset}d` : `${hh}:${mm}`;
}

/**
 * Formats a minute duration cleanly (e.g. 95 -> "1h 35m", 45 -> "45m").
 */
export function formatDuration(minutes: number): string {
  const mins = Math.max(0, Math.trunc(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
