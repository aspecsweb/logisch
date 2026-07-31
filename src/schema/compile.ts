// Compiles a `LogSchema` into something that can actually parse a line.
//
// Pure and DOM-free: this runs inside a consumer's worker during a real
// parse *and* on the main thread while a builder UI re-previews on every
// keystroke. One function backing both is deliberate — a preview that
// compiled the pattern differently from the parse would be a preview that
// lies.
//
// Failures come back as data, never thrown. A half-typed pattern is the
// normal state of an input box, not an exceptional one.

import { SCHEMA_FIELDS, type LogSchema, type SchemaField } from "./types";
import type { JsonConfig } from "./json";
import { lookupToken } from "./tokens";
import { createTimeParser, type TimeParser } from "./timeformat";

export type IssueSeverity = "error" | "warning";

export interface SchemaIssue {
  severity: IssueSeverity;
  message: string;
  /** Offsets into `schema.pattern`, when the issue is about one token. */
  start?: number;
  end?: number;
}

/** A parsed slice of the pattern string. Drives an editor's highlighting. */
export type PatternSegment =
  | { kind: "literal"; start: number; end: number; text: string }
  | {
      kind: "token";
      start: number;
      end: number;
      /** Token name as written, upper-cased. */
      token: string;
      field?: SchemaField;
      known: boolean;
    };

export interface FieldBinding {
  field: SchemaField;
  /** Name of the capture group in the compiled regex. */
  group: string;
}

export interface CompiledSchema {
  /** Null when the pattern is empty or failed to compile. */
  regex: RegExp | null;
  bindings: FieldBinding[];
  /** Compiled once here rather than per line. */
  parseTime: TimeParser;
  /** Applied to the line before parsing; null when unset or invalid. */
  skipRegex: RegExp | null;
  /** Lower-cased keys, so lookups don't have to normalise per line. */
  levelMap: Map<string, string> | null;
  segments: PatternSegment[];
  issues: SchemaIssue[];
  /** A usable regex and no errors. Warnings don't block. */
  ok: boolean;
  /** Set for `syntax: "json"`; the regex fields are unused in that mode. */
  json?: JsonConfig;
}

const FIELD_SET = new Set<string>(SCHEMA_FIELDS);

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whitespace is matched flexibly: one space in a pattern matches any run in
 * the input. Column-aligned logs pad to width, and making people count
 * spaces is exactly what sends them back to writing the regex by hand.
 */
function literalToSource(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? "\\s+" : escapeLiteral(part)))
    .join("");
}

const TOKEN_RE = /%\{([A-Za-z_][A-Za-z0-9_]*)(?::([A-Za-z_][A-Za-z0-9_]*))?\}/g;

/**
 * Splits a pattern into literal and token segments. Shared by compilation
 * and by editor highlighting, so the two can never disagree.
 */
export function scanPattern(pattern: string): {
  segments: PatternSegment[];
  issues: SchemaIssue[];
} {
  const segments: PatternSegment[] = [];
  const issues: SchemaIssue[] = [];
  let cursor = 0;

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(pattern)) !== null) {
    if (match.index > cursor) {
      segments.push({
        kind: "literal",
        start: cursor,
        end: match.index,
        text: pattern.slice(cursor, match.index),
      });
    }

    const [full, rawName, rawField] = match;
    const start = match.index;
    const end = start + full.length;
    const def = lookupToken(rawName);

    let field: SchemaField | undefined;
    if (rawField) {
      if (FIELD_SET.has(rawField)) {
        field = rawField as SchemaField;
      } else {
        issues.push({
          severity: "error",
          message: `"${rawField}" isn't a field. Use one of: ${SCHEMA_FIELDS.join(", ")}.`,
          start,
          end,
        });
      }
    } else {
      field = def?.defaultField;
    }

    if (!def) {
      issues.push({
        severity: "error",
        message: `Unknown token %{${rawName}}.`,
        start,
        end,
      });
    }

    segments.push({
      kind: "token",
      start,
      end,
      token: rawName.toUpperCase(),
      field,
      known: Boolean(def),
    });

    cursor = end;
  }

  if (cursor < pattern.length) {
    segments.push({
      kind: "literal",
      start: cursor,
      end: pattern.length,
      text: pattern.slice(cursor),
    });
  }

  // A stray `%{` that didn't form a complete token reads as literal text and
  // will never match — far more likely a typo than a deliberate literal.
  for (const segment of segments) {
    if (segment.kind !== "literal" || !segment.text.includes("%{")) continue;
    issues.push({
      severity: "error",
      message: "Unclosed %{…} — a token needs a closing brace.",
      start: segment.start + segment.text.indexOf("%{"),
      end: segment.end,
    });
  }

  return { segments, issues };
}

/**
 * `d` makes every match compute capture offsets. A builder UI needs them to
 * highlight what matched where; a 500 MB parse in a worker does not, and
 * shouldn't pay for them a few million times.
 */
export interface CompileOptions {
  captureOffsets?: boolean;
}

function flagsFor(options: CompileOptions): string {
  return options.captureOffsets ? "d" : "";
}

interface PartialCompile {
  regex: RegExp | null;
  bindings: FieldBinding[];
  issues: SchemaIssue[];
}

function compilePattern(
  segments: PatternSegment[],
  options: CompileOptions,
): PartialCompile {
  const issues: SchemaIssue[] = [];
  const bindings: FieldBinding[] = [];
  const seen = new Set<SchemaField>();
  let source = "";
  let groupIndex = 0;
  let previousGreedy: string | null = null;

  for (const segment of segments) {
    if (segment.kind === "literal") {
      if (segment.text.trim()) previousGreedy = null;
      source += literalToSource(segment.text);
      continue;
    }

    const def = lookupToken(segment.token);
    if (!def) return { regex: null, bindings: [], issues };

    // Two unbounded tokens with nothing but whitespace between them: the
    // split point is arbitrary, so the capture boundary is too. Worth
    // saying out loud — it's the most common way a hand-written grok
    // pattern silently captures the wrong halves.
    if (def.greedy && previousGreedy) {
      issues.push({
        severity: "warning",
        message: `%{${previousGreedy}} and %{${segment.token}} are both open-ended, so where one stops and the next starts is a guess. Put a literal between them.`,
        start: segment.start,
        end: segment.end,
      });
    }
    previousGreedy = def.greedy ? segment.token : null;

    // Named groups rather than positional ones: a token's own source may
    // contain groups, and miscounting would bind a field to the wrong one.
    const group = `g${groupIndex++}`;
    source += `(?<${group}>${def.source})`;

    if (!segment.field) continue;

    if (seen.has(segment.field)) {
      issues.push({
        severity: "error",
        message: `Field "${segment.field}" is captured twice — only the first would be used.`,
        start: segment.start,
        end: segment.end,
      });
      continue;
    }
    seen.add(segment.field);
    bindings.push({ field: segment.field, group });
  }

  if (!source) return { regex: null, bindings: [], issues };

  try {
    // Anchored at the start only. A pattern describing a prefix is a
    // legitimate thing to write — you get the fields you asked for and the
    // tail is ignored — whereas requiring `$` would reject every line with
    // a trailing field the author didn't care about.
    return {
      regex: new RegExp(`^${source}`, flagsFor(options)),
      bindings,
      issues,
    };
  } catch (error) {
    issues.push({
      severity: "error",
      message:
        error instanceof Error ? error.message : "Pattern failed to compile.",
    });
    return { regex: null, bindings: [], issues };
  }
}

const NAMED_GROUP_RE = /\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/g;

function compileRawRegex(
  pattern: string,
  options: CompileOptions,
): PartialCompile {
  const issues: SchemaIssue[] = [];

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flagsFor(options));
  } catch (error) {
    return {
      regex: null,
      bindings: [],
      issues: [
        {
          severity: "error",
          message:
            error instanceof Error
              ? error.message
              : "Invalid regular expression.",
        },
      ],
    };
  }

  const bindings: FieldBinding[] = [];
  const unknown: string[] = [];
  NAMED_GROUP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = NAMED_GROUP_RE.exec(pattern)) !== null) {
    const name = match[1];
    if (FIELD_SET.has(name)) {
      bindings.push({ field: name as SchemaField, group: name });
    } else {
      unknown.push(name);
    }
  }

  if (bindings.length === 0) {
    issues.push({
      severity: "error",
      message: `No named groups match a field. Name a group after the field it fills, e.g. (?<level>\\w+). Fields: ${SCHEMA_FIELDS.join(", ")}.`,
    });
  }

  if (unknown.length > 0) {
    issues.push({
      severity: "warning",
      message: `Ignoring group${unknown.length > 1 ? "s" : ""} ${unknown
        .map((name) => `(?<${name}>)`)
        .join(", ")} — not a field name.`,
    });
  }

  return { regex, bindings, issues };
}

function emptyCompiled(issues: SchemaIssue[]): CompiledSchema {
  return {
    regex: null,
    bindings: [],
    parseTime: () => NaN,
    skipRegex: null,
    levelMap: null,
    segments: [],
    issues,
    ok: false,
  };
}

/**
 * JSON mode carries a field mapping rather than a pattern, so there is no
 * regex to build — only the time parser, the level map and validation.
 */
function compileJson(schema: LogSchema): CompiledSchema {
  const config: JsonConfig = schema.json ?? { fields: {} };
  const issues: SchemaIssue[] = [];

  const bindings: FieldBinding[] = SCHEMA_FIELDS.filter(
    (field) => config.fields[field],
  ).map((field) => ({ field, group: config.fields[field]! }));

  if (bindings.length === 0) {
    issues.push({
      severity: "error",
      message: "No fields are mapped yet. Point at least one field at a path.",
    });
  }

  if (!config.fields.time) {
    issues.push({
      severity: "warning",
      message:
        "Nothing maps to time, so these records can't be placed on a timeline or charted. The table still works.",
    });
  }

  if (!config.fields.message) {
    issues.push({
      severity: "warning",
      message:
        "Nothing maps to message — a summary of the record's other fields is used instead.",
    });
  }

  let skipRegex: RegExp | null = null;
  if (schema.skipPattern) {
    try {
      skipRegex = new RegExp(schema.skipPattern);
    } catch {
      issues.push({
        severity: "error",
        message: "Skip pattern isn't a valid regular expression.",
      });
    }
  }

  return {
    regex: null,
    bindings,
    parseTime: createTimeParser(schema.timeFormat),
    skipRegex,
    levelMap:
      schema.levelMap && Object.keys(schema.levelMap).length > 0
        ? new Map(
            Object.entries(schema.levelMap).map(([from, to]) => [
              from.toLowerCase(),
              to,
            ]),
          )
        : null,
    segments: [],
    issues,
    ok: !issues.some((issue) => issue.severity === "error"),
    json: config,
  };
}

/**
 * Compiles a schema. Cheap enough to call on every keystroke — regex
 * construction dominates and is microseconds — so callers needn't cache it.
 */
export function compileSchema(
  schema: LogSchema,
  options: CompileOptions = {},
): CompiledSchema {
  if (schema.syntax === "json") return compileJson(schema);

  if (!schema.pattern.trim()) {
    return emptyCompiled([{ severity: "error", message: "Pattern is empty." }]);
  }

  const scan =
    schema.syntax === "regex"
      ? { segments: [] as PatternSegment[], issues: [] as SchemaIssue[] }
      : scanPattern(schema.pattern);

  const compiled =
    schema.syntax === "regex"
      ? compileRawRegex(schema.pattern, options)
      : compilePattern(scan.segments, options);

  const issues = [...scan.issues, ...compiled.issues];

  let skipRegex: RegExp | null = null;
  if (schema.skipPattern) {
    try {
      skipRegex = new RegExp(schema.skipPattern);
    } catch {
      issues.push({
        severity: "error",
        message: "Skip pattern isn't a valid regular expression.",
      });
    }
  }

  const hasField = (field: SchemaField) =>
    compiled.bindings.some((binding) => binding.field === field);

  if (compiled.regex && !hasField("time")) {
    issues.push({
      severity: "warning",
      message:
        "Nothing captures time, so these lines can't be placed on a timeline or charted. The table still works.",
    });
  }

  if (compiled.regex && !hasField("message")) {
    issues.push({
      severity: "warning",
      message: "Nothing captures message — the whole line is used instead.",
    });
  }

  const levelMap =
    schema.levelMap && Object.keys(schema.levelMap).length > 0
      ? new Map(
          Object.entries(schema.levelMap).map(([from, to]) => [
            from.toLowerCase(),
            to,
          ]),
        )
      : null;

  return {
    regex: compiled.regex,
    bindings: compiled.bindings,
    parseTime: createTimeParser(schema.timeFormat),
    skipRegex,
    levelMap,
    segments: scan.segments,
    issues,
    ok:
      Boolean(compiled.regex) &&
      !issues.some((issue) => issue.severity === "error"),
  };
}
