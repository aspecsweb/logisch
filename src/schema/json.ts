// JSON mode: schemas for logs that aren't line-shaped.
//
// The pattern and regex syntaxes both assume one entry per line. Plenty of
// real logs don't work that way — an audit-log export is a *single* JSON
// document holding an array of events, so no line-oriented pattern can ever
// split it into more than one entry. This mode works on the parsed
// document instead: point at the array, map fields to paths.
//
// It also covers JSONL (one object per line) with no records path set, so
// both shapes go through the same code.

import type { SchemaField } from "./types";
import {
  LEVEL_KEYS,
  MESSAGE_KEYS,
  NUMERIC_LEVELS,
  PID_KEYS,
  SERVICE_KEYS,
  TAG_KEYS,
  TID_KEYS,
  TIMESTAMP_KEYS,
} from "../utils/JsonFieldAliases";

/** Dot/bracket path to a value: `target.name`, `items[0].id`. */
export type JsonPath = string;

export type JsonFieldMap = Partial<Record<SchemaField, JsonPath>>;

export interface JsonConfig {
  /**
   * Path to the array of records. Empty means "the document is already the
   * records" — either a top-level array, or one object per line (JSONL).
   */
  recordsPath?: string;
  fields: JsonFieldMap;
  /**
   * Paths used to build the message when no field maps to one, in order.
   * Chosen at inference time from the fields that actually *vary* across
   * the sample — a column identical on every row tells you nothing, and
   * left unordered it crowds the informative fields out of the summary.
   */
  summaryPaths?: string[];
}

/** Reads a dot/bracket path out of parsed JSON. Undefined if absent. */
export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;

  let current = value;
  for (const segment of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Every path in a record that holds a scalar, in document order.
 *
 * This is what makes the mode usable: a UI can offer the real paths as
 * one-click choices instead of asking someone to type `target.property`
 * from memory.
 */
export function listPaths(value: unknown, maxDepth = 4): string[] {
  const paths: string[] = [];

  const walk = (node: unknown, prefix: string, depth: number) => {
    if (depth > maxDepth || !isPlainObject(node)) return;

    for (const [key, child] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(child)) {
        walk(child, path, depth + 1);
      } else if (!Array.isArray(child)) {
        paths.push(path);
      }
    }
  };

  walk(value, "", 0);
  return paths;
}

/**
 * Finds the array of records inside a parsed document.
 *
 * Prefers the largest array of objects — an export usually has exactly one,
 * and the envelope key it sits under (`logs`, `events`, `items`, `data`)
 * varies enough that guessing by name alone is unreliable.
 */
export function findRecordsPath(document: unknown): string | null {
  if (Array.isArray(document)) return "";

  let best: { path: string; length: number } | undefined;

  const walk = (node: unknown, prefix: string, depth: number) => {
    if (depth > 3 || !isPlainObject(node)) return;

    for (const [key, child] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(child)) {
        if (child.length > 0 && child.every(isPlainObject)) {
          if (!best || child.length > best.length) {
            best = { path, length: child.length };
          }
        }
      } else if (isPlainObject(child)) {
        walk(child, path, depth + 1);
      }
    }
  };

  walk(document, "", 0);
  return best ? best.path : null;
}

export interface ExtractResult {
  records: Record<string, unknown>[];
  /** Set when the text couldn't be read as JSON at all. */
  error?: string;
}

/**
 * Document text → records.
 *
 * Tries the whole text as one JSON document first (the array-envelope
 * case), then falls back to JSONL. Doing it in that order matters: a
 * pretty-printed document is many lines, none of which is valid JSON on
 * its own.
 */
export function extractRecords(
  text: string,
  recordsPath?: string,
): ExtractResult {
  const trimmed = text.trim();
  if (!trimmed) return { records: [] };

  try {
    const document = JSON.parse(trimmed) as unknown;
    const target = getPath(document, recordsPath ?? "");

    if (Array.isArray(target)) {
      return { records: target.filter(isPlainObject) };
    }
    if (isPlainObject(target)) return { records: [target] };

    return {
      records: [],
      error: recordsPath
        ? `Nothing at "${recordsPath}" — expected an array of records.`
        : "The document isn't an array of records; set a records path.",
    };
  } catch {
    // Not one document — try one object per line.
  }

  const records: Record<string, unknown>[] = [];

  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isPlainObject(parsed)) records.push(parsed);
    } catch {
      // Lines that aren't JSON are reported as unparsed records by the
      // preview, the same way an unmatched line is in pattern mode.
    }
  }

  if (records.length === 0) {
    return { records: [], error: "Not valid JSON, and not one object per line." };
  }
  return { records };
}

// Aliases beyond the shared set, for shapes the plain JSON parser doesn't
// try to cover. Audit logs in particular carry an `action`/`origin` pair
// where an application log would carry `level`/`service`.
const EXTRA_LEVEL_KEYS = [
  "action",
  "eventtype",
  "event_type",
  "outcome",
  "result",
  "status",
  "verb",
];
const EXTRA_SERVICE_KEYS = ["origin", "system", "subsystem", "provider", "kind"];

const lastSegment = (path: string): string =>
  path.slice(path.lastIndexOf(".") + 1).toLowerCase();

/** First path whose final segment matches one of `aliases`, aliases in order. */
function matchPath(paths: string[], aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const wanted = alias.toLowerCase();
    // Shallower paths win, so `name` beats `target.actor.name`.
    const hit = paths
      .filter((path) => lastSegment(path) === wanted)
      .sort((a, b) => a.split(".").length - b.split(".").length)[0];
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Paths worth summarising: those whose value differs somewhere in the
 * sample, minus the ones already shown in their own column.
 *
 * Falls back to every unmapped path when nothing varies — a one-record
 * sample has no variation to measure, and an empty message is worse than
 * a repetitive one.
 */
export function summaryPathsFor(
  records: Record<string, unknown>[],
  taken: Set<string>,
  limit = 6,
): string[] {
  const sample = records.slice(0, 40);
  const distinct = new Map<string, Set<string>>();
  const present = new Map<string, number>();

  for (const record of sample) {
    for (const path of listPaths(record)) {
      if (taken.has(path) || isIdentifierPath(path)) continue;
      const value = getPath(record, path);
      if (value === null || value === undefined || value === "") continue;

      let seen = distinct.get(path);
      if (!seen) {
        seen = new Set();
        distinct.set(path, seen);
      }
      // Capped: distinguishing "varies" from "constant" only needs two.
      if (seen.size <= 2) seen.add(String(value));
      present.set(path, (present.get(path) ?? 0) + 1);
    }
  }

  // A field counts as informative if its value differs somewhere, or if it
  // is simply absent from some records — `target.property` appears on
  // update events only, and that presence is itself the interesting part.
  const informative = [...distinct.entries()]
    .filter(
      ([path, values]) =>
        values.size > 1 || (present.get(path) ?? 0) < sample.length,
    )
    .map(([path]) => path);

  return (informative.length > 0 ? informative : [...distinct.keys()]).slice(
    0,
    limit,
  );
}

/**
 * Identifier-ish paths — `id`, `actor.id`, `eventGroupID`, `request_id`.
 *
 * They're the highest-cardinality fields in most records, so any ranking by
 * distinctness puts them first, and they're exactly the fields a human
 * can't read. They're for correlation, not for scanning a table.
 */
function isIdentifierPath(path: string): boolean {
  const segment = path.slice(path.lastIndexOf(".") + 1);
  return /^id$|_id$|(?:[a-z])(?:Id|ID)$|^uuid$|^guid$/.test(segment);
}

/**
 * Suggests a field mapping from a sample of records.
 *
 * Paths are collected across several records, not just the first: audit
 * records are famously heterogeneous — some carry `new`/`old`, some don't —
 * and mapping off record zero alone misses fields the rest of the file has.
 */
export function inferJsonFields(records: Record<string, unknown>[]): JsonFieldMap {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const record of records.slice(0, 20)) {
    for (const path of listPaths(record)) {
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }

  const fields: JsonFieldMap = {};
  const time = matchPath(paths, TIMESTAMP_KEYS);
  if (time) fields.time = time;

  const level = matchPath(paths, [...LEVEL_KEYS, ...EXTRA_LEVEL_KEYS]);
  if (level) fields.level = level;

  const service = matchPath(paths, [...SERVICE_KEYS, ...EXTRA_SERVICE_KEYS]);
  if (service) fields.service = service;

  const message = matchPath(paths, MESSAGE_KEYS);
  if (message) fields.message = message;

  const pid = matchPath(paths, PID_KEYS);
  if (pid) fields.pid = pid;
  const tid = matchPath(paths, TID_KEYS);
  if (tid) fields.tid = tid;
  const tag = matchPath(paths, TAG_KEYS);
  if (tag) fields.tag = tag;

  return fields;
}

const MAX_SUMMARY_FIELDS = 8;
const MAX_VALUE_CHARS = 80;

/**
 * Stands in for `message` when no field maps to one.
 *
 * Dumping the whole record as JSON is what the plain JSON parser does, and
 * on a table row it's unreadable. A `key=value` summary of the scalars that
 * aren't already shown in their own column carries the same information in
 * a form you can actually scan.
 */
export function summarize(
  record: Record<string, unknown>,
  taken: Set<string>,
  preferred?: string[],
): string {
  const parts: string[] = [];

  for (const path of preferred?.length ? preferred : listPaths(record)) {
    if (taken.has(path) || parts.length >= MAX_SUMMARY_FIELDS) continue;
    const value = getPath(record, path);
    if (value === null || value === undefined || value === "") continue;

    const text = String(value);
    parts.push(
      `${path}=${text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text}`,
    );
  }

  if (parts.length > 0) return parts.join(" ");

  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

/** Reads one field off a record, normalising numbers and numeric levels. */
export function readField(
  record: Record<string, unknown>,
  path: string | undefined,
  field: SchemaField,
): string {
  if (!path) return "";
  const value = getPath(record, path);
  if (value === null || value === undefined) return "";

  if (field === "level" && typeof value === "number") {
    return NUMERIC_LEVELS[value] ?? String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}
