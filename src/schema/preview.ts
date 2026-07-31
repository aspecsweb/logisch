// Running a schema over a sample and reporting, item by item, what it did.
//
// This is what makes a schema builder honest. A match rate alone tells you
// something is wrong but not what; these results say which items failed,
// which failed *only* on the timestamp, and what each field actually
// captured — which is how you notice that `service` is quietly eating the
// log level.
//
// "Item" is a line in pattern/regex mode and a record in JSON mode. Both
// go through the same shape so every consumer downstream is unaware of the
// difference.

import type { LogEntry } from "../models/LogEntry";
import type { LogSchema, SchemaField } from "./types";
import { compileSchema, type CompiledSchema, type SchemaIssue } from "./compile";
import { applyJsonRecord, applySchema, type FieldCapture } from "./parser";
import { extractRecords } from "./json";

export type PreviewStatus = "ok" | "no-match" | "bad-time" | "skipped";

export interface PreviewLine {
  /** 1-based index within the sampled lines/records. */
  lineNumber: number;
  raw: string;
  status: PreviewStatus;
  /** Only set when `status` is "ok". */
  entry: LogEntry | null;
  captures: FieldCapture[];
  /** Only set when `status` is "bad-time": the text that wouldn't parse. */
  rawTimestamp?: string;
}

export interface FieldSample {
  field: SchemaField;
  /** Distinct captured values, in first-seen order. */
  values: string[];
  /** How many distinct values were seen before the list was capped. */
  distinct: number;
}

export interface SchemaPreview {
  lines: PreviewLine[];
  counts: Record<PreviewStatus, number> & { total: number };
  /** Parsed items over items that were *attempted* (skipped don't count). */
  matchRate: number;
  issues: SchemaIssue[];
  /** Items that failed, capped — the "why doesn't this work" list. */
  failures: PreviewLine[];
  /** What each bound field actually captured. The best mis-capture detector. */
  fieldSamples: FieldSample[];
}

export interface PreviewOptions {
  /**
   * How many items to run. The default is sized for a responsive
   * keystroke-by-keystroke preview rather than accuracy over a whole file —
   * a pathological pattern stays slow-but-survivable.
   */
  limit?: number;
  /** Distinct values kept per field. */
  samplesPerField?: number;
}

/** Splits file text into lines, tolerating CRLF. Blank lines are dropped. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

/** One item to run the schema against, already reduced to text + payload. */
type Item = { raw: string; record?: Record<string, unknown> };

function itemsFor(compiled: CompiledSchema, source: string, limit: number) {
  if (!compiled.json) {
    return {
      items: splitLines(source)
        .slice(0, limit)
        .map((raw): Item => ({ raw })),
      issues: [] as SchemaIssue[],
    };
  }

  const { records, error } = extractRecords(source, compiled.json.recordsPath);
  return {
    items: records.slice(0, limit).map((record): Item => ({
      // The compact form is what a UI shows for the row and what the skip
      // pattern is tested against — the original document has no per-record
      // text to point at.
      raw: JSON.stringify(record),
      record,
    })),
    issues: error ? [{ severity: "error" as const, message: error }] : [],
  };
}

/**
 * Runs `compiled` over `source`. Takes an already-compiled schema so a
 * caller re-previewing on every keystroke compiles once and can reuse the
 * result for other UI (segments, bindings).
 */
export function previewCompiled(
  compiled: CompiledSchema,
  source: string,
  options: PreviewOptions = {},
): SchemaPreview {
  const limit = options.limit ?? 200;
  const samplesPerField = options.samplesPerField ?? 6;

  const { items, issues: sourceIssues } = itemsFor(compiled, source, limit);

  const results: PreviewLine[] = [];
  const counts = {
    ok: 0,
    "no-match": 0,
    "bad-time": 0,
    skipped: 0,
    total: items.length,
  };

  const seenByField = new Map<SchemaField, Set<string>>();
  const valuesByField = new Map<SchemaField, string[]>();

  const note = (field: SchemaField, text: string) => {
    let seen = seenByField.get(field);
    if (!seen) {
      seen = new Set();
      seenByField.set(field, seen);
      valuesByField.set(field, []);
    }
    if (seen.has(text)) return;
    seen.add(text);
    const values = valuesByField.get(field)!;
    if (values.length < samplesPerField) values.push(text);
  };

  for (const [index, item] of items.entries()) {
    const match = item.record
      ? applyJsonRecord(compiled, item.record, item.raw)
      : applySchema(compiled, item.raw, item.raw);

    counts[match.status] += 1;

    const line: PreviewLine = {
      lineNumber: index + 1,
      raw: item.raw,
      status: match.status,
      entry: match.status === "ok" ? match.entry : null,
      captures:
        match.status === "ok" || match.status === "bad-time"
          ? match.captures
          : [],
    };
    if (match.status === "bad-time") line.rawTimestamp = match.rawTimestamp;
    results.push(line);

    // JSON mode has no offsets to highlight, so field samples come from the
    // entry itself rather than from captures.
    if (item.record && match.status === "ok") {
      for (const binding of compiled.bindings) {
        const value = {
          time: match.entry.rawTimestamp,
          level: match.entry.level,
          service: match.entry.service,
          message: match.entry.message,
          pid: match.entry.pid ?? "",
          tid: match.entry.tid ?? "",
          tag: match.entry.tag ?? "",
        }[binding.field];
        if (value) note(binding.field, value);
      }
    }

    for (const capture of line.captures) note(capture.field, capture.text);
  }

  const attempted = counts.total - counts.skipped;

  return {
    lines: results,
    counts,
    matchRate: attempted > 0 ? counts.ok / attempted : 0,
    issues: [...compiled.issues, ...sourceIssues],
    failures: results
      .filter((line) => line.status === "no-match" || line.status === "bad-time")
      .slice(0, 20),
    fieldSamples: [...valuesByField.entries()].map(([field, values]) => ({
      field,
      values,
      distinct: seenByField.get(field)?.size ?? 0,
    })),
  };
}

/** Compiles `schema` (with capture offsets) and previews it in one step. */
export function previewSchema(
  schema: LogSchema,
  source: string,
  options: PreviewOptions = {},
): SchemaPreview {
  return previewCompiled(
    compileSchema(schema, { captureOffsets: true }),
    source,
    options,
  );
}
