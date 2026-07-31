// Turning a captured timestamp string into epoch milliseconds.
//
// Two modes, and the distinction is the whole reason this file exists:
//
//   "auto"  — sniff the shape. Covers most logs and costs the user nothing.
//   format  — an explicit `YYYY-MM-DD HH:mm:ss` style string.
//
// Sniffing cannot resolve genuine ambiguity: `03/04/2024` is 3 April under
// `DD/MM/YYYY` and 4 March under `MM/DD/YYYY`, and nothing in the string
// says which. That's what the format mode is for, and why a builder UI
// should show the *parsed date* back to the user rather than a green tick —
// an off-by-a-month timestamp parses "successfully" and silently ruins
// every chart downstream.
//
// Timezone rule: an explicit offset in the text wins. Without one the
// timestamp is read as local time, matching both `Date.parse` on non-ISO
// input and `localDateTimeToEpoch` in utils/DateUtils.

import { localDateTimeToEpoch } from "../utils/DateUtils";

export const AUTO_TIME_FORMAT = "auto";
export const EPOCH_SECONDS_FORMAT = "epoch";
export const EPOCH_MILLIS_FORMAT = "epoch_ms";

const MONTH_INDEX = new Map<string, number>();
for (const [index, name] of [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
].entries()) {
  MONTH_INDEX.set(name, index);
  MONTH_INDEX.set(name.slice(0, 3), index);
}

type PartKind =
  | "year"
  | "year2"
  | "monthName"
  | "month"
  | "day"
  | "hour24"
  | "hour12"
  | "minute"
  | "second"
  | "fraction"
  | "meridiem"
  | "offset"
  | "epochSeconds"
  | "epochMillis";

interface FormatToken {
  token: string;
  kind: PartKind;
  source: string;
}

// Longest-first: `YYYY` must be tried before `YY`, `MMMM` before `MMM`.
const FORMAT_TOKENS: FormatToken[] = [
  { token: "YYYY", kind: "year", source: "\\d{4}" },
  { token: "YY", kind: "year2", source: "\\d{2}" },
  { token: "MMMM", kind: "monthName", source: "[A-Za-z]+" },
  { token: "MMM", kind: "monthName", source: "[A-Za-z]{3}" },
  { token: "MM", kind: "month", source: "\\d{2}" },
  { token: "M", kind: "month", source: "\\d{1,2}" },
  { token: "DD", kind: "day", source: "\\d{2}" },
  { token: "D", kind: "day", source: "\\d{1,2}" },
  { token: "HH", kind: "hour24", source: "\\d{2}" },
  { token: "H", kind: "hour24", source: "\\d{1,2}" },
  { token: "hh", kind: "hour12", source: "\\d{2}" },
  { token: "h", kind: "hour12", source: "\\d{1,2}" },
  { token: "mm", kind: "minute", source: "\\d{2}" },
  { token: "m", kind: "minute", source: "\\d{1,2}" },
  { token: "ss", kind: "second", source: "\\d{2}" },
  { token: "s", kind: "second", source: "\\d{1,2}" },
  { token: "SSSSSS", kind: "fraction", source: "\\d{6}" },
  { token: "SSS", kind: "fraction", source: "\\d{3}" },
  { token: "SS", kind: "fraction", source: "\\d{2}" },
  { token: "S", kind: "fraction", source: "\\d{1,9}" },
  { token: "A", kind: "meridiem", source: "[AaPp]\\.?[Mm]\\.?" },
  { token: "a", kind: "meridiem", source: "[AaPp]\\.?[Mm]\\.?" },
  { token: "ZZ", kind: "offset", source: "[+-]\\d{4}|Z" },
  { token: "Z", kind: "offset", source: "[+-]\\d{2}:?\\d{2}|Z" },
  { token: "X", kind: "epochSeconds", source: "\\d{9,11}" },
  { token: "x", kind: "epochMillis", source: "\\d{12,14}" },
];

/** The tokens a user can put in a format string, for a help popover. */
export const TIME_FORMAT_TOKENS: { token: string; means: string }[] = [
  { token: "YYYY", means: "4-digit year" },
  { token: "YY", means: "2-digit year" },
  { token: "MMM", means: "Month name (Mar)" },
  { token: "MM", means: "2-digit month" },
  { token: "DD", means: "2-digit day" },
  { token: "HH", means: "Hour, 24h" },
  { token: "hh", means: "Hour, 12h (needs A)" },
  { token: "mm", means: "Minutes" },
  { token: "ss", means: "Seconds" },
  { token: "SSS", means: "Milliseconds" },
  { token: "A", means: "AM/PM" },
  { token: "Z", means: "UTC offset" },
];

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CompiledTimeFormat {
  regex: RegExp;
  /** Kind of each capture group, in group order. */
  kinds: PartKind[];
}

/**
 * Compiles a format string into a regex plus the meaning of each group.
 *
 * Text inside square brackets is literal, so a format can contain letters
 * that would otherwise read as tokens: `YYYY-MM-DD[T]HH:mm:ss`.
 */
export function compileTimeFormat(format: string): CompiledTimeFormat {
  const kinds: PartKind[] = [];
  let source = "";
  let index = 0;
  let literal = "";

  const flushLiteral = () => {
    if (!literal) return;
    // A run of whitespace in the format matches any run in the input;
    // column-aligned logs pad to a variable width.
    source += escapeLiteral(literal).replace(/(?:\\?\s)+/g, "\\s+");
    literal = "";
  };

  while (index < format.length) {
    if (format[index] === "[") {
      const end = format.indexOf("]", index + 1);
      if (end !== -1) {
        literal += format.slice(index + 1, end);
        index = end + 1;
        continue;
      }
    }

    const match = FORMAT_TOKENS.find((candidate) =>
      format.startsWith(candidate.token, index),
    );

    if (match) {
      flushLiteral();
      source += `(${match.source})`;
      kinds.push(match.kind);
      index += match.token.length;
      continue;
    }

    literal += format[index];
    index += 1;
  }

  flushLiteral();
  return { regex: new RegExp(`^${source}$`), kinds };
}

interface DateParts {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  ms?: number;
  meridiem?: "am" | "pm";
  offsetMinutes?: number;
  epochMs?: number;
}

/** `+01:00`, `-0530`, `Z` → minutes east of UTC. */
function parseOffset(text: string): number | undefined {
  if (/^z$/i.test(text)) return 0;
  const match = text.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return undefined;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Fractional digits → milliseconds. `.5` is 500ms, `.000318` is 0ms. */
function fractionToMs(digits: string): number {
  return Math.round(Number(`0.${digits}`) * 1000);
}

function partsToEpoch(parts: DateParts): number {
  if (parts.epochMs !== undefined) return parts.epochMs;

  let hour = parts.hour ?? 0;
  if (parts.meridiem === "pm" && hour < 12) hour += 12;
  if (parts.meridiem === "am" && hour === 12) hour = 0;

  // A stamp with no year (syslog's `Mar 11 09:14:02`) is assumed to be from
  // this year — the same assumption `resolveSyslogTime` makes in
  // utils/SyslogUtils. Wrong for archived logs and across a New Year
  // boundary; there is nothing in the line to do better with.
  const year = parts.year ?? new Date().getFullYear();
  const month = parts.month ?? 1;
  const day = parts.day ?? 1;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const ms = parts.ms ?? 0;

  if (parts.offsetMinutes !== undefined) {
    return (
      Date.UTC(year, month - 1, day, hour, minute, second, ms) -
      parts.offsetMinutes * 60000
    );
  }

  const epoch = localDateTimeToEpoch(year, month, day, hour, minute, second, ms);

  // `new Date(y, …)` maps years 0-99 onto 1900-1999; restore the literal year.
  if (year >= 0 && year < 100) {
    const date = new Date(epoch);
    date.setFullYear(year);
    return date.getTime();
  }
  return epoch;
}

function applyPart(parts: DateParts, kind: PartKind, text: string): boolean {
  switch (kind) {
    case "year":
      parts.year = Number(text);
      return true;
    case "year2": {
      // The usual pivot: 69-99 → 1969-1999, 00-68 → 2000-2068.
      const value = Number(text);
      parts.year = value >= 69 ? 1900 + value : 2000 + value;
      return true;
    }
    case "monthName": {
      const index = MONTH_INDEX.get(text.toLowerCase().slice(0, 3));
      if (index === undefined) return false;
      parts.month = index + 1;
      return true;
    }
    case "month":
      parts.month = Number(text);
      return parts.month >= 1 && parts.month <= 12;
    case "day":
      parts.day = Number(text);
      return parts.day >= 1 && parts.day <= 31;
    case "hour24":
      parts.hour = Number(text);
      return parts.hour <= 23;
    case "hour12":
      parts.hour = Number(text);
      return parts.hour >= 1 && parts.hour <= 12;
    case "minute":
      parts.minute = Number(text);
      return parts.minute <= 59;
    case "second":
      // 60 shows up in leap-second logs; let it through rather than
      // rejecting a whole line over one second.
      parts.second = Number(text);
      return parts.second <= 60;
    case "fraction":
      parts.ms = fractionToMs(text);
      return true;
    case "meridiem":
      parts.meridiem = /^p/i.test(text) ? "pm" : "am";
      return true;
    case "offset": {
      const offset = parseOffset(text);
      if (offset === undefined) return false;
      parts.offsetMinutes = offset;
      return true;
    }
    case "epochSeconds":
      parts.epochMs = Number(text) * 1000;
      return true;
    case "epochMillis":
      parts.epochMs = Number(text);
      return true;
  }
}

/** Applies an already-compiled format. Returns NaN when the text doesn't fit. */
export function parseWithCompiledFormat(
  text: string,
  compiled: CompiledTimeFormat,
): number {
  const match = text.trim().match(compiled.regex);
  if (!match) return NaN;

  const parts: DateParts = {};
  for (const [index, kind] of compiled.kinds.entries()) {
    if (!applyPart(parts, kind, match[index + 1])) return NaN;
  }
  return partsToEpoch(parts);
}

// ---------------------------------------------------------------------------
// auto
// ---------------------------------------------------------------------------

// Tried in order. Each is a shape `Date.parse` either gets wrong or refuses.
const AUTO_FORMAT_STRINGS = [
  "YYYY-MM-DD[T]HH:mm:ss.SZ",
  "YYYY-MM-DD HH:mm:ss.S",
  "YYYY-MM-DD HH:mm:ss",
  "YYYY/MM/DD HH:mm:ss.S",
  "YYYY/MM/DD HH:mm:ss",
  "DD/MMM/YYYY:HH:mm:ss Z", // Common Log Format
  "MMM DD HH:mm:ss", // syslog, year-less
  "MMM D HH:mm:ss",
  "MM-DD HH:mm:ss.S", // Android logcat, year-less
  "YYYY-MM-DD",
];

const AUTO_FORMATS = AUTO_FORMAT_STRINGS.map(compileTimeFormat);

/**
 * Best-effort epoch for a timestamp of unknown shape.
 *
 * Bare digit runs are read as epoch seconds/milliseconds by width, which is
 * why a 4-digit year on its own (`2024`) is deliberately *not* treated as a
 * timestamp here — it would silently become 1970.
 */
export function parseAutoTimestamp(raw: string): number {
  const text = raw.trim();
  if (!text) return NaN;

  if (/^\d+$/.test(text)) {
    if (text.length >= 12 && text.length <= 14) return Number(text);
    if (text.length >= 9 && text.length <= 11) return Number(text) * 1000;
    return NaN;
  }

  // `Date.parse` handles genuine ISO-8601 exactly and fastest. Comma decimal
  // separators are common in logs and not valid ISO, so normalise first.
  const isoish = text.replace(
    /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}),(\d+)/,
    "$1.$2",
  );
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(isoish)) {
    const parsed = Date.parse(isoish);
    if (!Number.isNaN(parsed)) return parsed;
  }

  for (const compiled of AUTO_FORMATS) {
    const parsed = parseWithCompiledFormat(text, compiled);
    if (!Number.isNaN(parsed)) return parsed;
  }

  // Last resort — catches `Sun Dec 04 04:47:44 2005` and other shapes V8
  // recognises natively.
  const fallback = Date.parse(text);
  return Number.isNaN(fallback) ? NaN : fallback;
}

export type TimeParser = (raw: string) => number;

/** Builds the parse function for a schema's `timeFormat`, compiled once. */
export function createTimeParser(format: string): TimeParser {
  const trimmed = (format ?? "").trim();

  if (!trimmed || trimmed === AUTO_TIME_FORMAT) return parseAutoTimestamp;

  if (trimmed === EPOCH_SECONDS_FORMAT) {
    return (raw) => {
      const value = Number(raw.trim());
      return Number.isFinite(value) ? value * 1000 : NaN;
    };
  }

  if (trimmed === EPOCH_MILLIS_FORMAT) {
    return (raw) => {
      const value = Number(raw.trim());
      return Number.isFinite(value) ? value : NaN;
    };
  }

  const compiled = compileTimeFormat(trimmed);
  return (raw) => parseWithCompiledFormat(raw, compiled);
}

/**
 * Picks a format string that can read `sample`, for when `auto` can't.
 * Returns null when nothing fits — better to leave the schema on `auto` and
 * let the preview report the failure than to invent a format that happens
 * to parse one line.
 */
export function guessTimeFormat(sample: string): string | null {
  const text = sample.trim();
  if (!text) return null;

  // Ambiguous orderings, day-first before month-first: the rest of the
  // world outnumbers US-style logs, and a builder UI shows the resulting
  // date so a wrong pick is visible immediately.
  const ambiguous = [
    "DD/MM/YYYY HH:mm:ss",
    "MM/DD/YYYY HH:mm:ss",
    "DD-MM-YYYY HH:mm:ss",
    "DD.MM.YYYY HH:mm:ss",
    "DD/MM/YY HH:mm:ss",
    "MM/DD/YY HH:mm:ss",
  ];

  const candidates = [
    ...AUTO_FORMAT_STRINGS,
    // Each ambiguous shape also with fractional seconds, and date-only.
    // Missing these was a real bug: a trailing `.318` made every candidate
    // miss, this returned null, and the caller fell back to `auto` — whose
    // `Date.parse` last resort silently reads 11/03 as 3 November.
    ...ambiguous.flatMap((format) => [format, `${format}.S`]),
    ...ambiguous.map((format) => format.replace(/ HH:mm:ss$/, "")),
    "MM/DD/YYYY hh:mm:ss A",
    "DD/MM/YYYY hh:mm:ss A",
    "YYYY-MM-DD hh:mm:ss A",
    "YYYYMMDD[T]HHmmss",
    "HH:mm:ss.S",
    "HH:mm:ss",
  ];

  for (const format of candidates) {
    if (!Number.isNaN(parseWithCompiledFormat(text, compileTimeFormat(format)))) {
      return format;
    }
  }
  return null;
}
