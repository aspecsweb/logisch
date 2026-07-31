import type { JsonConfig } from "./json";

/**
 * A user-defined log format.
 *
 * Deliberately plain, serializable data rather than a `LogParser` subclass:
 * consumers run parsing inside a Web Worker, so a schema has to survive
 * `postMessage`'s structured clone. It's also what makes a schema
 * shareable — the JSON a developer saves is the same JSON they can commit
 * next to the service that writes the logs.
 *
 * `compile.ts` turns one of these into something that can parse a line.
 */

/**
 * The `LogEntry` fields a pattern can bind a capture to. Anything a schema
 * doesn't fill in is derived (see `parser.ts`): an unbound `message` falls
 * back to the whole line, an unbound `level` to "INFO".
 */
export type SchemaField =
  | "time"
  | "level"
  | "service"
  | "message"
  | "pid"
  | "tid"
  | "tag";

export const SCHEMA_FIELDS: SchemaField[] = [
  "time",
  "level",
  "service",
  "message",
  "pid",
  "tid",
  "tag",
];

/**
 * How to read `pattern`.
 *
 * - `pattern` — the token DSL: `%{TIMESTAMP:time} [%{LEVEL:level}] %{GREEDYDATA:message}`.
 *   Literal text matches literally, runs of whitespace match flexibly.
 * - `regex` — the escape hatch. `pattern` is a raw regular expression and
 *   fields come from named groups: `(?<time>\S+) (?<level>\w+)`.
 * - `json` — not line-shaped at all. `pattern` is unused; the mapping lives
 *   in `json`. Needed because a JSON export is one document holding an
 *   array of records, which no per-line pattern can split up.
 */
export type SchemaSyntax = "pattern" | "regex" | "json";

export interface LogSchema {
  id: string;
  name: string;
  syntax: SchemaSyntax;
  pattern: string;
  /**
   * How to turn the captured `time` text into epoch milliseconds:
   * `auto`, `epoch`, `epoch_ms`, or a format string (`YYYY-MM-DD HH:mm:ss`).
   * See `timeformat.ts`.
   */
  timeFormat: string;
  /**
   * Rewrites captured level text before it reaches the entry, keyed
   * case-insensitively — `{"E": "ERROR", "sev=3": "WARN"}`. Levels are
   * otherwise passed through verbatim; a log's level vocabulary is whatever
   * its author chose, not a fixed set.
   */
  levelMap?: Record<string, string>;
  /**
   * Lines matching this are dropped before parsing — banners, `#` comments,
   * the header row of a CSV-ish log. A raw regex.
   */
  skipPattern?: string;
  /** Field mapping for `syntax: "json"`. Ignored by the other syntaxes. */
  json?: JsonConfig;
  /** Free-text note. Survives export, so it's the place to say what writes this log. */
  notes?: string;
  /** Epoch ms, for "recently edited" ordering. */
  updatedAt: number;
}

export function createSchemaId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptySchema(name: string): LogSchema {
  return {
    id: createSchemaId(),
    name,
    syntax: "pattern",
    pattern: "",
    timeFormat: "auto",
    updatedAt: Date.now(),
  };
}

/**
 * Narrows unknown JSON to a schema, for import and for rehydrating
 * persisted state. Returns null rather than throwing — an unreadable file a
 * user dragged in is an expected outcome, not an exception.
 */
/** Narrows the JSON-mode config, dropping anything that isn't a path string. */
function readJsonConfig(value: unknown): JsonConfig | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;

  const fields =
    typeof raw.fields === "object" && raw.fields !== null
      ? Object.fromEntries(
          Object.entries(raw.fields as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};

  return {
    recordsPath:
      typeof raw.recordsPath === "string" ? raw.recordsPath : undefined,
    fields,
    summaryPaths: Array.isArray(raw.summaryPaths)
      ? raw.summaryPaths.filter((path): path is string => typeof path === "string")
      : undefined,
  };
}

export function parseSchemaJson(value: unknown): LogSchema | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  // JSON-mode schemas legitimately have no pattern.
  if (typeof raw.pattern !== "string" && raw.syntax !== "json") return null;

  const levelMap =
    typeof raw.levelMap === "object" && raw.levelMap !== null
      ? Object.fromEntries(
          Object.entries(raw.levelMap as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createSchemaId(),
    name: typeof raw.name === "string" && raw.name ? raw.name : "Imported",
    syntax:
      raw.syntax === "regex" || raw.syntax === "json" ? raw.syntax : "pattern",
    pattern: typeof raw.pattern === "string" ? raw.pattern : "",
    timeFormat: typeof raw.timeFormat === "string" ? raw.timeFormat : "auto",
    levelMap:
      levelMap && Object.keys(levelMap).length > 0 ? levelMap : undefined,
    skipPattern:
      typeof raw.skipPattern === "string" && raw.skipPattern
        ? raw.skipPattern
        : undefined,
    json: readJsonConfig(raw.json),
    notes: typeof raw.notes === "string" && raw.notes ? raw.notes : undefined,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}
