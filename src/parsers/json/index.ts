import { BaseParser } from "../../core/BaseParser";
import type { LogEntry } from "../../models/LogEntry";

// Candidate key aliases used across common structured-logging libraries
// (pino, bunyan, winston, logrus, zap, serilog, ...). Matched case-insensitively.
const TIMESTAMP_KEYS = [
  "timestamp",
  "time",
  "ts",
  "@timestamp",
  "datetime",
  "date",
  "eventtime",
  "@t",
];
const LEVEL_KEYS = [
  "level",
  "severity",
  "lvl",
  "loglevel",
  "log.level",
  "levelname",
  "@l",
];
const MESSAGE_KEYS = [
  "message",
  "msg",
  "text",
  "event",
  "short_message",
  "@m",
];
const SERVICE_KEYS = [
  "service",
  "logger",
  "name",
  "component",
  "module",
  "source",
  "channel",
  "app",
];
const PID_KEYS = ["pid", "process", "processid", "process_id"];
const TID_KEYS = ["tid", "thread", "threadid", "thread_id"];
const TAG_KEYS = ["tag", "category"];

// pino/bunyan and syslog emit numeric severities; map them to canonical names.
const NUMERIC_LEVELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

type JsonRecord = Record<string, unknown>;

export class JsonParser extends BaseParser {
  // Quick, non-allocating pre-check: the line must look like a JSON object.
  // The authoritative validation happens in parse() via JSON.parse, which
  // returns null on failure so the registry ring can fall through.
  protected regex = /^\s*\{.*\}\s*$/s;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line)) return null;

    let obj: JsonRecord;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        return null;
      obj = parsed as JsonRecord;
    } catch {
      return null;
    }

    const lookup = this.buildLookup(obj);

    const { rawTimestamp, time } = this.resolveTimestamp(lookup);
    const level = this.resolveLevel(lookup);
    const service = this.pickString(lookup, SERVICE_KEYS) ?? "";
    const message = this.resolveMessage(lookup, obj, line);

    const entry: LogEntry = {
      time,
      rawTimestamp,
      level,
      service,
      message,
      color: this.resolveColor(level),
      raw,
    };

    const pid = this.pickString(lookup, PID_KEYS);
    if (pid) entry.pid = pid;
    const tid = this.pickString(lookup, TID_KEYS);
    if (tid) entry.tid = tid;
    const tag = this.pickString(lookup, TAG_KEYS);
    if (tag) entry.tag = tag;

    return entry;
  }

  // Lower-cases every top-level key once so alias lookups stay O(1).
  private buildLookup(obj: JsonRecord): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (!map.has(lower)) map.set(lower, obj[key]);
    }
    return map;
  }

  private pickString(
    lookup: Map<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = lookup.get(key);
      if (value === undefined || value === null) continue;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      } else if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
    }
    return undefined;
  }

  private resolveTimestamp(lookup: Map<string, unknown>): {
    rawTimestamp: string;
    time: number;
  } {
    for (const key of TIMESTAMP_KEYS) {
      const value = lookup.get(key);
      if (value === undefined || value === null) continue;

      if (typeof value === "number") {
        // Heuristic: 10-digit values are epoch seconds, larger are milliseconds.
        const time = value < 1e12 ? value * 1000 : value;
        return { rawTimestamp: String(value), time };
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) continue;

        const numeric = Number(trimmed);
        if (!Number.isNaN(numeric) && /^\d+$/.test(trimmed)) {
          const time = numeric < 1e12 ? numeric * 1000 : numeric;
          return { rawTimestamp: trimmed, time };
        }

        const parsed = Date.parse(trimmed);
        return {
          rawTimestamp: trimmed,
          time: Number.isNaN(parsed) ? Date.now() : parsed,
        };
      }
    }

    return { rawTimestamp: "", time: Date.now() };
  }

  private resolveLevel(lookup: Map<string, unknown>): string {
    for (const key of LEVEL_KEYS) {
      const value = lookup.get(key);
      if (value === undefined || value === null) continue;

      if (typeof value === "number") {
        return NUMERIC_LEVELS[value] ?? this.detectLevel(String(value));
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) continue;

        // Numeric severity encoded as a string (e.g. "30").
        if (/^\d+$/.test(trimmed)) {
          const mapped = NUMERIC_LEVELS[Number(trimmed)];
          if (mapped) return mapped;
        }
        return this.detectLevel(trimmed);
      }
    }
    return "INFO";
  }

  private resolveMessage(
    lookup: Map<string, unknown>,
    obj: JsonRecord,
    line: string,
  ): string {
    const message = this.pickString(lookup, MESSAGE_KEYS);
    if (message) return message;

    // No recognizable message field — surface the compact JSON so no data is lost.
    try {
      return JSON.stringify(obj);
    } catch {
      return line.trim();
    }
  }
}
