import {
  MINUTES_PER_DAY,
  formatDuration,
  parseClosureTimeToMinutes,
  parseTimeToMinutes,
} from './timeUtils';
import type {
  Airport,
  AirportClosureInput,
  ClosurePreset,
  NormalizedClosure,
} from './types';

export const OPTIONAL_CLOSURE_PRESETS: readonly ClosurePreset[] = [
  { id: 'preset-blr', label: 'BLR Morning', airportId: 'BLR', startTime: '08:00', endTime: '10:00' },
  { id: 'preset-del', label: 'DEL Peak', airportId: 'DEL', startTime: '08:00', endTime: '10:00' },
  { id: 'preset-amd', label: 'AMD Hub', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
  { id: 'preset-bom', label: 'BOM Morning', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
];

/**
 * Returns optional scenario presets filtered strictly to stations present in the loaded dataset.
 */
export function getAvailableClosurePresets(airports: Airport[]): ClosurePreset[] {
  const validIds = new Set(airports.map((a) => a.id));
  return OPTIONAL_CLOSURE_PRESETS.filter((p) => validIds.has(p.airportId));
}

export type ClosureValidationOutcome =
  | {
      valid: true;
      normalized: Omit<NormalizedClosure, 'id'>;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * Validates and normalizes a single airport closure window:
 * - Verifies airport exists in active dataset
 * - Enforces strict 24-hour HH:MM format (minute precision; start 00:00-23:59, end 00:00-24:00)
 * - Rejects zero-duration closures (start === end)
 * - Normalizes overnight closures crossing midnight (e.g. 22:00-02:00 -> [1320, 1560), 4h)
 * - Prevents duplicate entries against existingClosures (ignoring excludeClosureId during edits)
 */
export function validateClosureWindow(
  input: { airportId: string; startTime: string; endTime: string },
  validAirportIds: ReadonlySet<string>,
  existingClosures: ReadonlyArray<Pick<AirportClosureInput, 'id' | 'airportId' | 'startTime' | 'endTime'>> = [],
  excludeClosureId?: string
): ClosureValidationOutcome {
  const airportId = input.airportId.trim();
  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();

  if (!airportId || !validAirportIds.has(airportId)) {
    return {
      valid: false,
      error: `Unknown airport station "${airportId || 'N/A'}". Select a valid station from the dataset.`,
    };
  }

  let startMins: number;
  try {
    startMins = parseTimeToMinutes(startTime);
  } catch {
    return {
      valid: false,
      error: `Invalid Start Time "${startTime}". Use 24-hour HH:MM IST format (00:00–23:59).`,
    };
  }

  let rawEndMins: number;
  try {
    rawEndMins = parseClosureTimeToMinutes(endTime);
  } catch {
    return {
      valid: false,
      error: `Invalid End Time "${endTime}". Use 24-hour HH:MM IST format (00:00–24:00).`,
    };
  }

  if (rawEndMins === startMins) {
    return {
      valid: false,
      error: 'Zero-duration closures are not allowed. End time must differ from start time.',
    };
  }

  const isOvernight = rawEndMins < startMins;
  const endMins = isOvernight ? rawEndMins + MINUTES_PER_DAY : rawEndMins;
  const durationMinutes = endMins - startMins;

  for (const existing of existingClosures) {
    if (excludeClosureId && existing.id === excludeClosureId) continue;
    if (existing.airportId !== airportId) continue;

    try {
      const exStart = parseTimeToMinutes(existing.startTime.trim());
      const exRawEnd = parseClosureTimeToMinutes(existing.endTime.trim());
      const exEnd = exRawEnd < exStart ? exRawEnd + MINUTES_PER_DAY : exRawEnd;
      if (exStart === startMins && exEnd === endMins) {
        return {
          valid: false,
          error: `Duplicate closure: ${airportId} ${startTime}–${endTime} is already configured.`,
        };
      }
    } catch {
      // Fall back to exact string comparison if legacy item fails parse
      if (existing.startTime.trim() === startTime && existing.endTime.trim() === endTime) {
        return {
          valid: false,
          error: `Duplicate closure: ${airportId} ${startTime}–${endTime} is already configured.`,
        };
      }
    }
  }

  return {
    valid: true,
    normalized: {
      airportId,
      startTime,
      endTime,
      startMins,
      endMins,
      isOvernight,
      durationMinutes,
    },
  };
}

export function formatClosureWindowLabel(
  closure: Pick<NormalizedClosure, 'startTime' | 'endTime' | 'isOvernight'>
): string {
  return closure.isOvernight
    ? `${closure.startTime}–${closure.endTime} (+1d)`
    : `${closure.startTime}–${closure.endTime}`;
}

export function formatClosureDurationSummary(durationMinutes: number, isOvernight: boolean): string {
  return isOvernight
    ? `${formatDuration(durationMinutes)} · Overnight (+1d)`
    : formatDuration(durationMinutes);
}

/**
 * Adjusts a valid 24-hour HH:MM string by deltaMinutes (wrapping cleanly within 00:00-23:59 or up to 24:00).
 */
export function stepTimeString(
  timeStr: string,
  deltaMinutes: number,
  allowEndOfDay2400 = false
): string | null {
  try {
    const mins = allowEndOfDay2400
      ? parseClosureTimeToMinutes(timeStr)
      : parseTimeToMinutes(timeStr);
    const maxVal = allowEndOfDay2400 ? MINUTES_PER_DAY : MINUTES_PER_DAY - 1;
    let next = mins + deltaMinutes;
    if (next < 0) next = maxVal + 1 + (next % (maxVal + 1));
    if (next > maxVal) next = next % (maxVal + 1);
    if (allowEndOfDay2400 && next === MINUTES_PER_DAY) {
      return '24:00';
    }
    const hh = String(Math.floor(next / 60)).padStart(2, '0');
    const mm = String(next % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return null;
  }
}
