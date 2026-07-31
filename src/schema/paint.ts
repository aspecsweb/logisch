// Building a pattern from spans someone selected on a sample line.
//
// This is what lets a UI offer "highlight the timestamp, click *time*"
// instead of "write a regex". The spans come from a text selection; this
// turns them into a pattern, copying the text between them verbatim so
// separators (`] [`, ` - `, `:`) survive exactly as they appear.
//
// Shared with `infer.ts`, which does the same substitution against spans it
// found automatically rather than ones a human picked.

import type { SchemaField } from "./types";
import { lookupToken } from "./tokens";

export interface FieldSpan {
  start: number;
  end: number;
  field: SchemaField;
}

const TIMESTAMP_SOURCE = lookupToken("TIMESTAMP")!.source;

/**
 * Picks the token that best matches what was actually selected.
 *
 * The field alone isn't enough: binding `time` to `%{TIMESTAMP}` is right
 * for `2024-03-11T09:14:02Z` and useless for `1710148442`, and a `service`
 * containing spaces needs `%{DATA}` rather than `%{NOTSPACE}`. Choosing
 * from the text means a selection captures what the user actually
 * highlighted.
 */
export function tokenFor(text: string, field: SchemaField): string {
  const selected = text.trim();

  if (field === "time") {
    // Epoch shapes first: `%{TIMESTAMP}` also matches a bare digit run, so
    // checking it first would label every epoch as a generic timestamp and
    // make the generated pattern say less than it could.
    if (/^\d{12,14}$/.test(selected)) return "%{EPOCH_MS:time}";
    if (/^\d{9,11}$/.test(selected)) return "%{EPOCH:time}";
    if (new RegExp(`^(?:${TIMESTAMP_SOURCE})$`).test(selected)) {
      return "%{TIMESTAMP:time}";
    }
    // Selected something a timestamp token can't describe — capture it
    // anyway and let the time format sort it out.
    return /\s/.test(selected) ? "%{DATA:time}" : "%{NOTSPACE:time}";
  }

  if (field === "message") return "%{GREEDYDATA:message}";
  if (field === "pid" || field === "tid") {
    return /^\d+$/.test(selected) ? `%{INT:${field}}` : `%{NOTSPACE:${field}}`;
  }
  if (field === "level") {
    return /^[A-Za-z][A-Za-z0-9_+#-]*$/.test(selected)
      ? "%{LEVEL:level}"
      : "%{NOTSPACE:level}";
  }

  // service, tag
  return /\s/.test(selected) ? `%{DATA:${field}}` : `%{NOTSPACE:${field}}`;
}

export interface RawSpan {
  start: number;
  end: number;
  token: string;
}

/**
 * Substitutes tokens for spans, keeping the text between them verbatim.
 *
 * Returns null when a literal would contain `%{`, which the DSL has no way
 * to escape — rare enough to decline rather than mangle.
 */
export function patternFromRawSpans(
  line: string,
  spans: RawSpan[],
): string | null {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let pattern = "";
  let cursor = 0;

  for (const span of sorted) {
    if (span.start < cursor) continue; // overlapping — drop it
    pattern += line.slice(cursor, span.start);
    pattern += span.token;
    cursor = span.end;
  }

  const literals = sorted.reduce(
    (text, span) => text.replace(span.token, ""),
    pattern,
  );
  if (literals.includes("%{")) return null;

  return pattern;
}

/**
 * Text before the first selection, turned into something that matches more
 * than the one line it was painted on.
 *
 * Copying it verbatim is the obvious implementation and the wrong one: if
 * you highlight the service in `11/03/2024 09:14:02.318 <checkout-api>`,
 * the literal timestamp gets baked into the pattern and it stops matching
 * every other line in the file.
 *
 * The rule: the punctuation immediately before the selection is a
 * delimiter and is kept; whatever precedes that is data the user hasn't
 * described yet, so it becomes a wildcard. Text *between* two selections
 * is left alone — there, the literal genuinely is the separator.
 */
function leadIn(prefix: string): string {
  if (!prefix) return "";

  // Whitespace is left out of the delimiter deliberately: `%{DATA}` is lazy
  // and will absorb it, and not demanding it keeps the pattern tolerant of
  // lines that pad differently.
  const delimiter = /[^A-Za-z0-9\s]*$/.exec(prefix)?.[0] ?? "";
  const data = prefix.slice(0, prefix.length - delimiter.length);
  return data.trim() ? `%{DATA}${delimiter}` : delimiter;
}

/**
 * The delimiter immediately after the last selection.
 *
 * Without it an unbounded token runs past its own field: painting the
 * service in `<checkout-api>` captures `checkout-api>`, because nothing in
 * the pattern says where to stop. Only punctuation is taken — never the
 * variable text beyond it.
 */
function tailOut(rest: string): string {
  return /^[^A-Za-z0-9\s]*/.exec(rest)?.[0] ?? "";
}

/**
 * Builds a pattern from field selections on `line`.
 *
 * A `message` span is extended to the end of the line — a message field
 * that stopped where the user's mouse did would drop the tail of every
 * longer line, and `%{GREEDYDATA}` is unbounded by nature.
 */
export function patternFromSpans(
  line: string,
  spans: FieldSpan[],
): string | null {
  const raw: RawSpan[] = spans.map((span) => ({
    start: span.start,
    end: span.field === "message" ? line.length : span.end,
    token: tokenFor(line.slice(span.start, span.end), span.field),
  }));

  const sorted = [...raw].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  if (!first) return null;

  const last = sorted[sorted.length - 1];
  const tail = tailOut(line.slice(last.end));

  if (first.start === 0) {
    const body = patternFromRawSpans(line, raw);
    return body === null ? null : `${body}${tail}`;
  }

  // Rewrite the unclaimed head, then build the rest from the line as usual.
  const body = patternFromRawSpans(
    line.slice(first.start),
    sorted.map((span) => ({
      ...span,
      start: span.start - first.start,
      end: span.end - first.start,
    })),
  );

  return body === null
    ? null
    : `${leadIn(line.slice(0, first.start))}${body}${tail}`;
}
