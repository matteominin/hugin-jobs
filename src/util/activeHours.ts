import type { ActiveHours } from '../types.js';

/** 06:00–24:00 Italian local time: no fetching, judging or notifying overnight. */
export const DEFAULT_ACTIVE_HOURS: ActiveHours = {
  startHour: 6,
  endHour: 24,
  timezone: 'Europe/Rome',
};

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Fall back to the defaults field by field, so a settings doc written by hand
 * with only `{ startHour: 8 }` is usable rather than a crash. An hour outside
 * 0–24, or a timezone the runtime doesn't know, is reported and ignored.
 */
export function resolveActiveHours(raw: Partial<ActiveHours> | undefined): ActiveHours {
  const hour = (value: unknown, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 24) {
      if (value !== undefined) console.warn(`[activeHours] ignoring invalid hour ${String(value)}`);
      return fallback;
    }
    return value;
  };

  let timezone = DEFAULT_ACTIVE_HOURS.timezone;
  if (typeof raw?.timezone === 'string' && raw.timezone) {
    if (isKnownTimezone(raw.timezone)) timezone = raw.timezone;
    else console.warn(`[activeHours] unknown timezone "${raw.timezone}", using ${timezone}`);
  }

  return {
    startHour: hour(raw?.startHour, DEFAULT_ACTIVE_HOURS.startHour),
    endHour: hour(raw?.endHour, DEFAULT_ACTIVE_HOURS.endHour),
    timezone,
  };
}

function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Seconds elapsed since local midnight in `timezone` (DST-correct). */
function secondsOfDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl renders midnight as hour 24 in some locales/versions
  return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
}

/**
 * The window is [startHour, endHour) in local time. `endHour: 24` means
 * midnight, and start === end means "always on" (the way to disable the window
 * without a code change). A window whose end is before its start wraps midnight.
 */
export function isWithinActiveHours(now: Date, hours: ActiveHours): boolean {
  const { startHour, endHour } = hours;
  if (startHour === endHour) return true;
  const seconds = secondsOfDay(now, hours.timezone);
  const start = startHour * 3600;
  const end = endHour * 3600;
  return start < end ? seconds >= start && seconds < end : seconds >= start || seconds < end;
}

/** Milliseconds until the window next opens; 0 when it is open right now. */
export function msUntilActive(now: Date, hours: ActiveHours): number {
  if (isWithinActiveHours(now, hours)) return 0;
  const seconds = secondsOfDay(now, hours.timezone);
  const start = (hours.startHour % 24) * 3600;
  const wait = (start - seconds + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return wait * 1000;
}

export function describeActiveHours(hours: ActiveHours): string {
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  if (hours.startHour === hours.endHour) return `always (${hours.timezone})`;
  return `${pad(hours.startHour)}–${pad(hours.endHour)} ${hours.timezone}`;
}
