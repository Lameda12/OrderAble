import type { Location, OpeningHours, Weekday } from "./schema.js";

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface LocalParts {
  weekday: Weekday;
  minutes: number; // minutes since local midnight
  date: string; // YYYY-MM-DD in the location's timezone
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const formatter = (timeZone: string) => {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
};

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = (parts.weekday ?? "Sun").slice(0, 3).toLowerCase() as Weekday;
  return {
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Hours windows for a weekday. A close earlier than open means "past midnight". */
const windowsFor = (hours: OpeningHours[], day: Weekday) => hours.filter((h) => h.day === day);

export function isOpenAt(location: Pick<Location, "hours" | "timezone">, at: Date): boolean {
  const { weekday, minutes } = localParts(at, location.timezone);
  const today = windowsFor(location.hours, weekday).some((h) => {
    const open = toMinutes(h.open);
    const close = toMinutes(h.close);
    return close > open ? minutes >= open && minutes < close : minutes >= open;
  });
  if (today) return true;
  // Overnight window from the previous day (e.g. sat 18:00-02:00).
  const prev = WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7]!;
  return windowsFor(location.hours, prev).some((h) => {
    const open = toMinutes(h.open);
    const close = toMinutes(h.close);
    return close <= open && minutes < close;
  });
}

/**
 * First instant at or after `from` when the location is open, scanning in 5-minute steps
 * for up to 8 days. Returns null if it never opens (no hours configured).
 */
export function nextOpenAt(location: Pick<Location, "hours" | "timezone">, from: Date): Date | null {
  if (location.hours.length === 0) return null;
  const step = 5 * 60_000;
  const start = Math.ceil(from.getTime() / step) * step;
  for (let t = start; t < start + 8 * 24 * 60 * 60_000; t += step) {
    const d = new Date(t);
    if (isOpenAt(location, d)) return d;
  }
  return null;
}

/** Human readable hours for today, e.g. "07:00-18:00" or "closed". */
export function hoursToday(location: Pick<Location, "hours" | "timezone">, at: Date): string {
  const { weekday } = localParts(at, location.timezone);
  const windows = windowsFor(location.hours, weekday);
  return windows.length ? windows.map((w) => `${w.open}-${w.close}`).join(", ") : "closed";
}

/** Next instant (after `from`) where local time is HH:MM on an open day. Used for demos and planning. */
export function nextLocalTime(
  location: Pick<Location, "hours" | "timezone">,
  from: Date,
  hhmm: string,
  opts: { notToday?: boolean } = {},
): Date {
  const target = toMinutes(hhmm);
  const today = localParts(from, location.timezone).date;
  const step = 5 * 60_000;
  const start = Math.ceil((from.getTime() + 60 * 60_000) / step) * step;
  for (let t = start; t < start + 9 * 24 * 60 * 60_000; t += step) {
    const d = new Date(t);
    const p = localParts(d, location.timezone);
    if (p.minutes === target && isOpenAt(location, d) && !(opts.notToday && p.date === today)) return d;
  }
  return new Date(start);
}

export const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
export const iso = (d: Date) => d.toISOString();

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
