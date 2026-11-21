// Calendar helpers on ISO date strings backed by Temporal.PlainDate (hard rule 2). No Date, no clock.
import { Temporal } from "@js-temporal/polyfill";

export type IsoDate = string;

export function plain(iso: IsoDate): Temporal.PlainDate {
  return Temporal.PlainDate.from(iso, { overflow: "reject" });
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return plain(from).until(plain(to), { largestUnit: "days" }).days;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return plain(iso).add({ days }).toString();
}

export function addMonthsClamped(iso: IsoDate, months: number): IsoDate {
  return plain(iso).add({ months }).toString();
}

/** The date in the month of `iso` with day-of-month `day`, clamped to the month's length. */
export function withDayClamped(iso: IsoDate, day: number): IsoDate {
  const d = plain(iso);
  return d.with({ day: Math.min(day, d.daysInMonth) }).toString();
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const d = plain(iso);
  return d.with({ day: d.daysInMonth }).toString();
}

/** ISO weekday 1 (Monday) to 7 (Sunday). */
export function weekdayOf(iso: IsoDate): number {
  return plain(iso).dayOfWeek;
}

export function isLastWeekdayOfMonth(iso: IsoDate): boolean {
  const d = plain(iso);
  return d.add({ days: 7 }).month !== d.month;
}

/** The last `weekday` (1 to 7) of the month containing `iso`. */
export function lastWeekdayOfMonth(iso: IsoDate, weekday: number): IsoDate {
  let d = plain(endOfMonth(iso));
  while (d.dayOfWeek !== weekday) d = d.subtract({ days: 1 });
  return d.toString();
}

export function isLastDayOfMonth(iso: IsoDate): boolean {
  const d = plain(iso);
  return d.day === d.daysInMonth;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const US = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/;
const YMD_SLASH = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NAMED = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/;
/** Day first with a named month, as Indian banks write it: `04-Nov-2026`, `4 Nov 2026`, `04/Nov/26`. */
const DAY_NAMED = /^(\d{1,2})[\s/.-]+([A-Za-z]{3,9})\.?,?[\s/.-]+(\d{4}|\d{2})$/;

/** Which number comes first in `04/11/2026`: the month (US) or the day (India and most of the world). */
export type DateOrder = "mdy" | "dmy";

function build(y: number, m: number, d: number): IsoDate | null {
  try {
    return Temporal.PlainDate.from({ year: y, month: m, day: d }, { overflow: "reject" }).toString();
  } catch {
    return null;
  }
}

function fullYear(y: string): number {
  if (y.length === 4) return Number(y);
  const n = Number(y);
  return n <= 69 ? 2000 + n : 1900 + n;
}

/**
 * Bank date formats, tried in order (BACKEND_PLAN §7.7): YYYY-MM-DD, YYYY/MM/DD, then the numeric form in `order`
 * (MM/DD/YYYY by default, DD/MM/YYYY for `dmy`), falling back to the other order only when the first number cannot
 * be what `order` says; then "Oct 3, 2026" and "03-Oct-2026". Null when none fits.
 */
export function parseBankDate(text: string, order: DateOrder = "mdy"): IsoDate | null {
  const s = text.trim();
  let m = ISO.exec(s) ?? YMD_SLASH.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = US.exec(s);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), fullYear(m[3] ?? "")];
    if (order === "dmy") return build(y, b, a) ?? (b > 12 ? build(y, a, b) : null);
    return build(y, a, b) ?? (a > 12 ? build(y, b, a) : null);
  }
  m = NAMED.exec(s);
  if (m) return named(m[1], Number(m[2]), Number(m[3]));
  m = DAY_NAMED.exec(s);
  if (m) return named(m[2], Number(m[1]), fullYear(m[3] ?? ""));
  return null;
}

function named(monthText: string | undefined, day: number, year: number): IsoDate | null {
  const month = MONTHS.indexOf((monthText ?? "").slice(0, 3).toLowerCase()) + 1;
  return month > 0 ? build(year, month, day) : null;
}

/**
 * The numeric date order of a whole column: a first number above 12 proves day first, a second number above 12
 * proves month first. Without proof either way (or with both), `fallback`: the household's country (ADR-022).
 */
export function inferDateOrder(cells: readonly string[], fallback: DateOrder): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const cell of cells) {
    const m = US.exec(cell.trim());
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) mdy = true;
  }
  if (dmy === mdy) return fallback;
  return dmy ? "dmy" : "mdy";
}
