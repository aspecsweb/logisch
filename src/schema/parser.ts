// Applying a compiled schema to a line.
//
// `applySchema` is the single place a line meets a schema — the production
// parse path and a builder's preview both go through it. They want
// different amounts of detail (the parser wants an entry or nothing; the
// preview wants to explain *why* nothing), so it returns a discriminated
// result and each caller takes what it needs. Two implementations would
// eventually disagree, and the one that disagreed would be the preview,
// which is the one users trust.
//
// Deliberately not a `BaseParser` subclass: that base normalises levels
// through `detectLevel` (mapping `SEVERE` onto `ERROR`, and so on), and a
// schema's whole point is that the level is whatever the author's pattern
// captured. `levelMap` is the opt-in way to normalise.

import type { LogEntry } from "../models/LogEntry";
import type { LogParser } from "../core/LogParser";
import { getLevelColor } from "../utils/LevelColors";
import { stringToHslColor } from "../utils/ColorUtils";
import type { SchemaField } from "./types";
import type { CompiledSchema } from "./compile";
import { readField, summarize } from "./json";

/** Where a field was found in the line — drives preview highlighting. */
export interface FieldCapture {
  field: SchemaField;
  text: string;
  start: number;
  end: number;
}

export type SchemaMatch =
  /** Dropped by the schema's skip pattern. */
  | { status: "skipped" }
  /** The pattern didn't match this line at all. */
  | { status: "no-match" }
  /**
   * Matched, but the captured timestamp didn't fit the time format. Kept
   * separate from `no-match` because the fix is completely different — the
   * pattern is right and the time format is wrong.
   */
  | { status: "bad-time"; rawTimestamp: string; captures: FieldCapture[] }
  | { status: "ok"; entry: LogEntry; captures: FieldCapture[] };

/**
 * Matches one line.
 *
 * `line` is what gets matched; `raw` is stored on the entry for copy/paste.
 * For a schema these are usually the same string — a custom format is
 * written against the file as it actually looks, so callers should *not*
 * apply the leading-dash/epoch-prefix normalisation they use for the
 * built-in parsers.
 */
export function applySchema(
  compiled: CompiledSchema,
  line: string,
  raw: string,
): SchemaMatch {
  if (!compiled.regex) return { status: "no-match" };
  if (compiled.skipRegex?.test(line)) return { status: "skipped" };

  const match = compiled.regex.exec(line);
  if (!match) return { status: "no-match" };

  const groups = match.groups ?? {};
  // Present only when compiled with `captureOffsets` — a builder does, a
  // worker doing a full parse doesn't.
  const indices = match.indices?.groups;

  const captures: FieldCapture[] = [];
  const values: Partial<Record<SchemaField, string>> = {};

  for (const binding of compiled.bindings) {
    const text = groups[binding.group];
    if (text === undefined) continue;
    values[binding.field] = text;

    const span = indices?.[binding.group];
    if (span) {
      captures.push({ field: binding.field, text, start: span[0], end: span[1] });
    }
  }

  const rawTimestamp = values.time ?? "";
  let time = 0;

  if (rawTimestamp) {
    time = compiled.parseTime(rawTimestamp);
    if (Number.isNaN(time)) {
      // Reported rather than kept at epoch 0: one 1970 entry stretches a
      // timeline's x-axis across half a century and makes every chart
      // useless. A builder surfaces these so the time format gets fixed
      // before the schema is used for real.
      return { status: "bad-time", rawTimestamp, captures };
    }
  }

  const rawLevel = values.level?.trim() ?? "";
  const level = compiled.levelMap?.get(rawLevel.toLowerCase()) ?? rawLevel;
  const resolvedLevel = level || "INFO";

  const entry: LogEntry = {
    time,
    rawTimestamp,
    level: resolvedLevel,
    service: values.service?.trim() ?? "",
    // No message binding means the pattern only described a prefix —
    // showing the whole line beats showing an empty cell.
    message: (values.message ?? line).trim(),
    color: getLevelColor(resolvedLevel) || stringToHslColor(resolvedLevel),
    raw,
  };

  if (values.pid) entry.pid = values.pid;
  if (values.tid) entry.tid = values.tid;
  if (values.tag) entry.tag = values.tag;

  return { status: "ok", entry, captures };
}

/**
 * Adapts a compiled schema to the `LogParser` interface, so a schema can be
 * dropped into the same registry as the built-in parsers.
 */
export class SchemaParser implements LogParser {
  private compiled: CompiledSchema;

  constructor(compiled: CompiledSchema) {
    this.compiled = compiled;
  }

  public canParse(line: string): boolean {
    return this.compiled.regex?.test(line) ?? false;
  }

  public parse(line: string, raw: string): LogEntry | null {
    const result = applySchema(this.compiled, line, raw);
    return result.status === "ok" ? result.entry : null;
  }
}

/**
 * Matches one JSON record.
 *
 * The record equivalent of `applySchema`: same statuses, same level and
 * time handling, so a JSON-mode schema behaves identically everywhere
 * downstream — the preview, the table, the chart. Only the extraction
 * differs (a path lookup rather than a capture group).
 */
export function applyJsonRecord(
  compiled: CompiledSchema,
  record: Record<string, unknown>,
  raw: string,
): SchemaMatch {
  const config = compiled.json;
  if (!config) return { status: "no-match" };
  if (compiled.skipRegex?.test(raw)) return { status: "skipped" };

  const values = {} as Partial<Record<SchemaField, string>>;
  for (const binding of compiled.bindings) {
    values[binding.field] = readField(record, binding.group, binding.field);
  }

  const rawTimestamp = values.time ?? "";
  let time = 0;
  if (rawTimestamp) {
    time = compiled.parseTime(rawTimestamp);
    if (Number.isNaN(time)) {
      return { status: "bad-time", rawTimestamp, captures: [] };
    }
  }

  const rawLevel = values.level?.trim() ?? "";
  const level = compiled.levelMap?.get(rawLevel.toLowerCase()) ?? rawLevel;
  const resolvedLevel = level || "INFO";

  const entry: LogEntry = {
    time,
    rawTimestamp,
    level: resolvedLevel,
    service: values.service?.trim() ?? "",
    message:
      values.message?.trim() ||
      summarize(
        record,
        new Set(compiled.bindings.map((b) => b.group)),
        config.summaryPaths,
      ),
    color: getLevelColor(resolvedLevel) || stringToHslColor(resolvedLevel),
    raw,
  };

  if (values.pid) entry.pid = values.pid;
  if (values.tid) entry.tid = values.tid;
  if (values.tag) entry.tag = values.tag;

  return { status: "ok", entry, captures: [] };
}
