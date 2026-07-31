// The `%{TOKEN}` vocabulary for schema patterns.
//
// One table drives three things: what `compile.ts` expands a token into,
// what a consumer's palette UI offers, and what `infer.ts` reaches for when
// it drafts a pattern from a sample. Adding a token here is the whole job.
//
// Regex sources are written to be backtracking-friendly: prefer explicit
// character classes over `.*`, and keep the genuinely unbounded tokens
// (DATA, GREEDYDATA) flagged so `compile.ts` can warn when two end up
// adjacent with nothing to separate them.

import type { SchemaField } from "./types";

export interface TokenDef {
  name: string;
  /** Regex source, without capture parens — compile.ts wraps it. */
  source: string;
  /**
   * Where this token's capture goes when the pattern doesn't say. Lets
   * `%{TIMESTAMP}` mean the obvious thing while `%{TIMESTAMP:tag}` still
   * works.
   */
  defaultField?: SchemaField;
  /** One-liner for a palette UI. */
  hint: string;
  /** Shown alongside the hint so you can see what it eats without testing. */
  example: string;
  /** Unbounded width; two in a row make a pattern ambiguous. */
  greedy?: boolean;
  group: "time" | "core" | "value";
}

// Date/time shapes, most specific first — TIMESTAMP alternates over these
// and regex alternation is first-match-wins.
const ISO8601 =
  "\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d{1,9})?(?:Z|[+-]\\d{2}:?\\d{2})?";
const SYSLOG_STAMP = "[A-Z][a-z]{2}\\s+\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2}";
const US_DATETIME =
  "\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}[ T]\\d{1,2}:\\d{2}(?::\\d{2})?(?:[.,]\\d{1,9})?(?:\\s*[AP]M)?";
const APACHE_STAMP =
  "[A-Z][a-z]{2} [A-Z][a-z]{2} {1,2}\\d{1,2} \\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)? \\d{4}";
const CLF_STAMP = "\\d{2}/[A-Z][a-z]{2}/\\d{4}:\\d{2}:\\d{2}:\\d{2} [+-]\\d{4}";
const COMPACT_STAMP = "\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}[.,]\\d{1,9}";

export const TOKENS: TokenDef[] = [
  // ---- time -------------------------------------------------------------
  {
    name: "TIMESTAMP",
    source: [
      ISO8601,
      APACHE_STAMP,
      CLF_STAMP,
      US_DATETIME,
      COMPACT_STAMP,
      SYSLOG_STAMP,
      "\\d{13}",
      "\\d{10}",
    ].join("|"),
    defaultField: "time",
    hint: "Any common timestamp shape",
    example: "2024-03-11T09:14:02.318Z",
    group: "time",
  },
  {
    name: "ISO8601",
    source: ISO8601,
    defaultField: "time",
    hint: "ISO-8601 / RFC-3339",
    example: "2024-03-11T09:14:02Z",
    group: "time",
  },
  {
    name: "SYSLOGSTAMP",
    source: SYSLOG_STAMP,
    defaultField: "time",
    hint: "Syslog stamp — no year, so the current one is assumed",
    example: "Mar 11 09:14:02",
    group: "time",
  },
  {
    name: "HTTPDATE",
    source: CLF_STAMP,
    defaultField: "time",
    hint: "Common Log Format date",
    example: "11/Mar/2024:09:14:02 +0000",
    group: "time",
  },
  {
    name: "DATE",
    source: "\\d{2,4}[-/]\\d{1,2}[-/]\\d{1,4}",
    hint: "Calendar date on its own",
    example: "2024-03-11",
    group: "time",
  },
  {
    name: "TIME",
    source: "\\d{1,2}:\\d{2}(?::\\d{2})?(?:[.,]\\d{1,9})?",
    hint: "Clock time on its own",
    example: "09:14:02.318",
    group: "time",
  },
  {
    name: "EPOCH",
    source: "\\d{9,11}",
    defaultField: "time",
    hint: "Unix seconds",
    example: "1710148442",
    group: "time",
  },
  {
    name: "EPOCH_MS",
    source: "\\d{12,14}",
    defaultField: "time",
    hint: "Unix milliseconds",
    example: "1710148442318",
    group: "time",
  },

  // ---- core -------------------------------------------------------------
  {
    name: "LEVEL",
    // Deliberately not a fixed vocabulary — a level is whatever the log's
    // author wrote. Word-ish runs so `notice`, `c++` and `sev3` all come
    // through; levelMap is where you normalise them.
    source: "[A-Za-z][A-Za-z0-9_+#-]*",
    defaultField: "level",
    hint: "Severity word, passed through as written",
    example: "WARN",
    group: "core",
  },
  {
    name: "WORD",
    source: "\\w+",
    hint: "Letters, digits, underscore",
    example: "checkout",
    group: "core",
  },
  {
    name: "NOTSPACE",
    source: "\\S+",
    hint: "Everything up to the next space",
    example: "svc/checkout-api",
    group: "core",
  },
  {
    name: "DATA",
    source: "[^\\n]*?",
    hint: "Anything, lazily — stops at the next literal in the pattern",
    example: "…",
    greedy: true,
    group: "core",
  },
  {
    name: "GREEDYDATA",
    source: "[^\\n]*",
    defaultField: "message",
    hint: "The rest of the line",
    example: "connection reset by peer",
    greedy: true,
    group: "core",
  },
  {
    name: "BRACKETS",
    source: "[^\\]\\n]*",
    hint: "Contents of a [bracketed] field — write the brackets yourself",
    example: "worker-3",
    group: "core",
  },

  // ---- values -----------------------------------------------------------
  {
    name: "INT",
    source: "[+-]?\\d+",
    hint: "Whole number",
    example: "4021",
    group: "value",
  },
  {
    name: "NUMBER",
    source: "[+-]?\\d+(?:\\.\\d+)?",
    hint: "Integer or decimal",
    example: "12.48",
    group: "value",
  },
  {
    name: "IP",
    source:
      "(?:\\d{1,3}\\.){3}\\d{1,3}|(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}",
    hint: "IPv4 or IPv6 address",
    example: "10.0.4.19",
    group: "value",
  },
  {
    name: "UUID",
    source: "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",
    hint: "UUID / GUID",
    example: "6f1c2b7e-…-9a4d",
    group: "value",
  },
  {
    name: "HOSTNAME",
    source: "[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\\.[A-Za-z0-9_-]+)*",
    hint: "Host or domain name",
    example: "api-7.eu.internal",
    group: "value",
  },
  {
    name: "PATH",
    source: "(?:/[^\\s/]*)+|(?:[A-Za-z]:\\\\[^\\s]*)",
    hint: "Unix or Windows path",
    example: "/var/log/app.log",
    group: "value",
  },
  {
    name: "QUOTED",
    source: '"[^"\\n]*"|\'[^\'\\n]*\'',
    hint: "A quoted string, quotes included",
    example: '"GET /health"',
    group: "value",
  },
];

const TOKEN_BY_NAME = new Map(TOKENS.map((token) => [token.name, token]));

export function lookupToken(name: string): TokenDef | undefined {
  return TOKEN_BY_NAME.get(name.toUpperCase());
}

export const TOKEN_NAMES: string[] = TOKENS.map((token) => token.name);
