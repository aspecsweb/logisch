// Drafting a schema from a sample of log lines.
//
// The point is not to be right — it's to replace the blank input box with
// something 80% correct that a developer can see, run, and correct. Getting
// the timestamp and the message boundary right is most of the value; the
// rest is a nudge.
//
// Approach: propose candidate patterns by finding recognisable spans in a
// few representative lines and substituting tokens for them (keeping the
// text between spans verbatim, so separators like `] [`, ` - ` and `:` are
// preserved exactly), then *score every candidate against the whole
// sample* and keep the winner. Scoring is what makes this robust: a banner
// or a stack-trace line at the top of the file produces a bad candidate,
// and a bad candidate loses.

import { compileSchema } from "./compile";
import { applyJsonRecord, applySchema } from "./parser";
import {
  extractRecords,
  findRecordsPath,
  inferJsonFields,
  summaryPathsFor,
} from "./json";
import { splitLines } from "./preview";
import { createSchemaId, type LogSchema } from "./types";
import { lookupToken } from "./tokens";
import { patternFromRawSpans } from "./paint";
import { guessTimeFormat, parseAutoTimestamp } from "./timeformat";

/** Words that mean "this chunk is the level", not part of the message. */
const LEVEL_WORDS = new Set([
  "TRACE",
  "VERBOSE",
  "FINE",
  "DEBUG",
  "INFO",
  "INFORMATION",
  "NOTICE",
  "WARN",
  "WARNING",
  "ERROR",
  "ERR",
  "SEVERE",
  "CRIT",
  "CRITICAL",
  "FATAL",
  "EMERG",
  "ALERT",
  "PANIC",
  "V",
  "D",
  "I",
  "W",
  "E",
  "F",
]);

const TIMESTAMP_SOURCE = lookupToken("TIMESTAMP")!.source;

interface Span {
  start: number;
  end: number;
  token: string;
  /**
   * Where the line continues once this field *and its trailing delimiters*
   * are consumed — past the `]` of a bracketed level, past the ` - ` after
   * a service name. Distinct from `end` (which covers only the captured
   * text) because that delimiter belongs in the pattern as literal text,
   * not at the front of every message.
   */
  after?: number;
}

/** A chunk of the line after the timestamp, with where it sits. */
interface Chunk {
  start: number;
  end: number;
  text: string;
  /** Text with surrounding brackets/parens stripped. */
  inner: string;
  bracketed: boolean;
}

// All four bracket styles: `[INFO]`, `(INFO)`, `{INFO}` and `<service>` all
// show up as field delimiters in the wild, and a chunker that only knows
// two of them silently treats the others as message text.
const CHUNK_RE = /\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\}|<([^>]*)>|(\S+)/g;

function chunksAfter(line: string, from: number): Chunk[] {
  const chunks: Chunk[] = [];
  CHUNK_RE.lastIndex = from;
  let match: RegExpExecArray | null;

  while ((match = CHUNK_RE.exec(line)) !== null) {
    const text = match[0];
    const inner = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? text;
    chunks.push({
      start: match.index,
      end: match.index + text.length,
      text,
      inner,
      // match[5] is the bare-word alternative; anything else was wrapped.
      bracketed: match[5] === undefined,
    });
    if (chunks.length >= 6) break;
  }
  return chunks;
}

const isLevelWord = (text: string): boolean =>
  LEVEL_WORDS.has(text.trim().toUpperCase());

/** `com.foo.Bar`, `svc/checkout`, `sshd`, `worker-3` — but not a sentence. */
const looksLikeService = (text: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9._/-]{1,60}$/.test(text) && !isLevelWord(text);

/**
 * Assembles a pattern by replacing spans with tokens and copying everything
 * between them verbatim — the copied text is what makes separators survive.
 * Shared with the click-to-capture path in `paint.ts`, which does the same
 * substitution against spans a human selected rather than ones found here.
 */
const buildPattern = patternFromRawSpans;

const IP_SOURCE = lookupToken("IP")!.source;

/**
 * Candidates for delimiter-separated logs (`a|b|c`, `a;b;c`), which
 * whitespace chunking can't see at all — it takes `|ERROR|billing|charge`
 * to be one chunk.
 */
function delimitedCandidates(line: string): string[] {
  const candidates: string[] = [];

  for (const delimiter of ["|", "\t", ";"]) {
    const parts = line.split(delimiter);
    if (parts.length < 3) continue;

    let usedService = false;
    const tokens = parts.map((part, index) => {
      const text = part.trim();
      if (index === parts.length - 1) return "%{GREEDYDATA:message}";
      if (new RegExp(`^${TIMESTAMP_SOURCE}$`).test(text)) {
        return "%{TIMESTAMP:time}";
      }
      if (isLevelWord(text)) return "%{LEVEL:level}";
      if (!usedService && looksLikeService(text)) {
        usedService = true;
        return "%{DATA:service}";
      }
      // Unbound, but still has to consume its column — the literal
      // delimiters on either side are what bound it.
      return "%{DATA}";
    });

    candidates.push(tokens.join(delimiter));
  }

  return candidates;
}

/**
 * Candidates that tokenize the text *before* the timestamp.
 *
 * Anything not covered by a span is copied into the pattern verbatim, so a
 * line like `10.0.4.19 - - [11/Mar/2024…]` would otherwise bake that
 * client IP in as a literal and match only requests from that one host.
 */
function prefixSpans(line: string, timeStart: number): Span[] {
  const prefix = line.slice(0, timeStart);
  if (!prefix.trim()) return [];

  const ip = new RegExp(IP_SOURCE).exec(prefix);
  if (ip) {
    return [
      {
        start: ip.index,
        end: ip.index + ip[0].length,
        token: "%{IP:service}",
        after: ip.index + ip[0].length,
      },
    ];
  }

  const word = /[A-Za-z_][A-Za-z0-9._/-]*/.exec(prefix);
  if (word) {
    return [
      {
        start: word.index,
        end: word.index + word[0].length,
        token: "%{NOTSPACE:service}",
        after: word.index + word[0].length,
      },
    ];
  }

  return [];
}

const BRACKET_PAIRS: Record<string, string> = { "[": "]", "(": ")", "{": "}" };

/**
 * Position after a span, stepping over the bracket that closes it when the
 * span turned out to be wrapped — `[2024-03-11T09:14:02Z]`.
 */
function closerAfter(line: string, start: number, length: number): number {
  const end = start + length;
  const closer = BRACKET_PAIRS[line[start - 1]];
  return closer && line[end] === closer ? end + 1 : end;
}

/** Candidate patterns derived from the shape of one line. */
function candidatesForLine(line: string): string[] {
  const timestamp = new RegExp(TIMESTAMP_SOURCE).exec(line);
  const candidates: string[] = [];

  const timeSpan: Span | null = timestamp
    ? {
        start: timestamp.index,
        end: timestamp.index + timestamp[0].length,
        token: "%{TIMESTAMP:time}",
        // A wrapped timestamp (`[…]`, `(…)`) must consume its closing
        // bracket, or it becomes the first character of every message.
        after: closerAfter(line, timestamp.index, timestamp[0].length),
      }
    : null;

  const afterTime = timeSpan ? timeSpan.end : 0;
  const chunks = chunksAfter(line, afterTime);

  let levelSpan: Span | null = null;
  let serviceSpan: Span | null = null;
  let pidSpan: Span | null = null;
  let tagSpan: Span | null = null;

  /** `sshd[4021]:` or `sshd:` — the chunk that names what wrote the line. */
  const isServiceish = (chunk: Chunk | undefined): boolean =>
    chunk !== undefined &&
    (/^[A-Za-z_][A-Za-z0-9._/-]*\[\d+\]:?$/.test(chunk.inner) ||
      (chunk.inner.endsWith(":") && looksLikeService(chunk.inner.slice(0, -1))));

  for (const [index, chunk] of chunks.entries()) {
    if (!levelSpan && isLevelWord(chunk.inner)) {
      // Bracketed levels keep their brackets as literal text: the span
      // covers only the inner word.
      const innerStart = chunk.bracketed
        ? chunk.start + chunk.text.indexOf(chunk.inner)
        : chunk.start;
      levelSpan = {
        start: innerStart,
        end: innerStart + chunk.inner.length,
        token: "%{LEVEL:level}",
        after: chunk.end,
      };
      continue;
    }

    // `sshd[1234]:` — service and pid in one chunk.
    const withPid = chunk.inner.match(/^([A-Za-z_][A-Za-z0-9._/-]*)\[(\d+)\]:?$/);
    if (!serviceSpan && withPid) {
      const base = chunk.start + chunk.text.indexOf(chunk.inner);
      serviceSpan = {
        start: base,
        end: base + withPid[1].length,
        token: "%{NOTSPACE:service}",
      };
      const pidStart = base + withPid[1].length + 1;
      pidSpan = {
        start: pidStart,
        end: pidStart + withPid[2].length,
        token: "%{INT:pid}",
        after: chunk.end,
      };
      continue;
    }

    // A bracketed chunk, a `name:` prefix, or a bare identifier followed by
    // a separator (`com.acme.Checkout - msg`, the logback default).
    const trailingColon = chunk.inner.endsWith(":");
    const bare = trailingColon ? chunk.inner.slice(0, -1) : chunk.inner;
    const separator = /^\s*[-–|:]\s/.exec(line.slice(chunk.end));
    if (
      !serviceSpan &&
      (chunk.bracketed || trailingColon || separator) &&
      looksLikeService(bare)
    ) {
      const base = chunk.start + chunk.text.indexOf(bare);
      serviceSpan = {
        start: base,
        end: base + bare.length,
        token: "%{NOTSPACE:service}",
        // Consume the separator too, so it lands in the pattern as literal
        // text. Left in the message it prefixes every single row
        // ("- order 5512 placed") with noise the pattern should absorb.
        after: chunk.end + (separator ? separator[0].length - 1 : 0),
      };
      continue;
    }

    // BSD syslog puts the host between the timestamp and the service:
    // `Mar 11 09:14:02 web-01 sshd[4021]: …`. Stopping at the host would
    // lose the service and pid entirely, and *skipping* it is worse still
    // — the text between spans is copied into the pattern verbatim, so a
    // hostname would be baked in as a literal and every other host would
    // stop matching. Binding it is the only correct option.
    if (
      !tagSpan &&
      !serviceSpan &&
      looksLikeService(chunk.inner) &&
      isServiceish(chunks[index + 1])
    ) {
      tagSpan = {
        start: chunk.start,
        end: chunk.end,
        token: "%{NOTSPACE:tag}",
        after: chunk.end,
      };
      continue;
    }

    // Anything else starts the message.
    break;
  }

  // Only offered when the schema has no service of its own, so the prefix
  // doesn't fight a real service field later in the line.
  const prefix = timeSpan && !serviceSpan ? prefixSpans(line, timeSpan.start) : [];

  const combos: Span[][] = [
    [timeSpan, levelSpan, tagSpan, serviceSpan, pidSpan],
    [timeSpan, levelSpan, tagSpan, serviceSpan],
    [timeSpan, levelSpan, serviceSpan, pidSpan],
    [timeSpan, levelSpan, serviceSpan],
    [timeSpan, levelSpan],
    [timeSpan],
    ...(prefix.length > 0
      ? [[...prefix, timeSpan, levelSpan], [...prefix, timeSpan]]
      : []),
  ].map((spans) => spans.filter((span): span is Span => span !== null));

  for (const fields of combos) {
    // The message picks up after whatever this combo actually kept — using
    // each field's `after`, so a delimiter the combo consumed becomes
    // literal pattern text, and a field the combo *dropped* has its text
    // fall into the message rather than being silently skipped.
    const resumeAt = fields.reduce(
      (position, span) => Math.max(position, span.after ?? span.end),
      0,
    );
    const messageStart = Math.min(
      line.length,
      resumeAt + (line.slice(resumeAt).match(/^\s+/)?.[0].length ?? 0),
    );

    const pattern = buildPattern(line, [
      ...fields,
      { start: messageStart, end: line.length, token: "%{GREEDYDATA:message}" },
    ]);
    if (pattern && !candidates.includes(pattern)) candidates.push(pattern);
  }

  return candidates;
}

/** Patterns worth trying regardless of what the sample looks like. */
const UNIVERSAL_CANDIDATES = [
  "%{TIMESTAMP:time} %{LEVEL:level} %{GREEDYDATA:message}",
  "%{TIMESTAMP:time} [%{LEVEL:level}] %{GREEDYDATA:message}",
  "[%{TIMESTAMP:time}] [%{LEVEL:level}] %{GREEDYDATA:message}",
  "%{TIMESTAMP:time} %{LEVEL:level} %{NOTSPACE:service} - %{GREEDYDATA:message}",
  "%{TIMESTAMP:time} %{NOTSPACE:service} %{LEVEL:level} %{GREEDYDATA:message}",
  "%{TIMESTAMP:time} %{GREEDYDATA:message}",
  "%{GREEDYDATA:message}",
];

export interface InferenceCandidate {
  pattern: string;
  matchRate: number;
  /** Number of fields the pattern binds. */
  fields: number;
  /**
   * Of the lines where a level was captured, the fraction whose value is
   * actually a recognisable severity word.
   */
  levelPlausibility: number;
  /** What the candidates are ranked by. See `scoreCandidate`. */
  score: number;
}

export interface InferenceResult {
  schema: LogSchema;
  matchRate: number;
  /** Every candidate considered, best first. Lets a UI offer alternatives. */
  candidates: InferenceCandidate[];
}

/**
 * Ranks a candidate.
 *
 * Match rate alone is not enough, and the two ways it fails are the reason
 * this function is weighted rather than a simple sort:
 *
 *   - `%{GREEDYDATA:message}` matches *every* line of *every* file, so on
 *     raw match rate the do-nothing pattern always wins. Structure has to
 *     be worth something.
 *   - Binding the wrong span is invisible structurally. For
 *     `[INFO] checkout-api`, a pattern capturing `service=[INFO]` and
 *     `level=checkout-api` matches just as often as the correct one — so a
 *     level that isn't a severity word actively costs the candidate.
 */
function scoreCandidate(pattern: string, samples: string[]): InferenceCandidate {
  // Offsets are needed to read back *what* each field captured, which is
  // how level plausibility below is judged.
  const compiled = compileSchema(
    {
      id: "",
      name: "",
      syntax: "pattern",
      pattern,
      timeFormat: "auto",
      updatedAt: 0,
    },
    { captureOffsets: true },
  );

  const empty = {
    pattern,
    matchRate: 0,
    fields: 0,
    levelPlausibility: 0,
    score: 0,
  };
  if (!compiled.regex) return empty;

  const bindsLevel = compiled.bindings.some((b) => b.field === "level");
  const bindsTime = compiled.bindings.some((b) => b.field === "time");

  let ok = 0;
  let levelsSeen = 0;
  let levelsPlausible = 0;

  for (const sample of samples) {
    // `bad-time` still counts as a structural match — the pattern found the
    // fields, and the time format is chosen separately below. Otherwise a
    // sample whose timestamp needs an explicit format would push inference
    // toward a worse pattern that captures no time at all.
    const result = applySchema(compiled, sample, sample);
    if (result.status !== "ok" && result.status !== "bad-time") continue;
    ok += 1;

    if (!bindsLevel) continue;
    const captured = result.captures.find((capture) => capture.field === "level");
    if (!captured) continue;
    levelsSeen += 1;
    if (isLevelWord(captured.text)) levelsPlausible += 1;
  }

  const matchRate = samples.length > 0 ? ok / samples.length : 0;
  const levelPlausibility = levelsSeen > 0 ? levelsPlausible / levelsSeen : 0;

  const levelBonus = bindsLevel
    ? 0.4 * levelPlausibility - 0.3 * (1 - levelPlausibility)
    : 0;

  return {
    pattern,
    matchRate,
    fields: compiled.bindings.length,
    levelPlausibility,
    score:
      matchRate *
      (1 + 0.15 * compiled.bindings.length + levelBonus + (bindsTime ? 0.2 : 0)),
  };
}

/**
 * An all-numeric date whose field order can't be recovered from the text:
 * `11/03/2024` is 11 March or 3 November depending on convention.
 */
const AMBIGUOUS_DATE_RE = /^\D*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/;

/**
 * Picks the `timeFormat` for an inferred schema.
 *
 * `auto` is left in place whenever it genuinely works, because it stays
 * right as a file's shape varies. The exception is ambiguous numeric dates:
 * `auto`'s last resort is `Date.parse`, which quietly applies the US
 * month-first reading and returns a perfectly valid — and possibly
 * eight-months-wrong — date. Nothing downstream can detect that. So for
 * those, commit to an explicit format string: it's visible in the builder,
 * and wrong-by-a-month becomes a one-click fix instead of a silent bug.
 */
function chooseTimeFormat(
  compiled: ReturnType<typeof compileSchema>,
  samples: string[],
): string {
  for (const sample of samples) {
    const result = applySchema(compiled, sample, sample);

    if (result.status === "bad-time") {
      return guessTimeFormat(result.rawTimestamp) ?? "auto";
    }

    if (result.status !== "ok") continue;
    const captured = result.entry.rawTimestamp;
    if (!captured) continue;

    if (AMBIGUOUS_DATE_RE.test(captured)) {
      return guessTimeFormat(captured) ?? "auto";
    }
    if (!Number.isNaN(parseAutoTimestamp(captured))) return "auto";
  }
  return "auto";
}

/**
 * Drafts a schema from raw file text.
 *
 * Prefers JSON mode whenever the text is JSON at all, because a JSON export
 * is usually one document holding an array of records — a shape no
 * line-oriented pattern can split up. Everything else falls through to
 * `inferSchema` below.
 */
export function inferSchemaFromText(
  text: string,
  name = "Custom format",
): InferenceResult {
  const json = inferJsonSchema(text, name);
  if (json) return json;
  return inferSchema(splitLines(text), name);
}

/** A JSON draft, or null when the text isn't usefully JSON. */
function inferJsonSchema(text: string, name: string): InferenceResult | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let recordsPath: string | undefined;
  try {
    const document = JSON.parse(trimmed) as unknown;
    const found = findRecordsPath(document);
    if (found === null) return null;
    recordsPath = found;
  } catch {
    // Not one document — extractRecords still handles JSONL below.
    recordsPath = undefined;
  }

  const { records } = extractRecords(trimmed, recordsPath);
  if (records.length === 0) return null;

  const fields = inferJsonFields(records);
  const summaryPaths = fields.message
    ? undefined
    : summaryPathsFor(records, new Set(Object.values(fields)));

  const schema: LogSchema = {
    id: createSchemaId(),
    name,
    syntax: "json",
    pattern: "",
    timeFormat: "auto",
    json: { recordsPath, fields, summaryPaths },
    updatedAt: Date.now(),
  };

  // Score it the same way a pattern is scored: how many records actually
  // come out. A mapping that finds nothing is worth reporting as such.
  const compiled = compileSchema(schema);
  let ok = 0;
  for (const record of records.slice(0, 40)) {
    const result = applyJsonRecord(compiled, record, JSON.stringify(record));
    if (result.status === "ok" || result.status === "bad-time") ok += 1;
  }
  const sampled = Math.min(records.length, 40);
  const matchRate = sampled > 0 ? ok / sampled : 0;

  return {
    schema,
    matchRate,
    candidates: [
      {
        pattern: `json:${recordsPath || "(document)"}`,
        matchRate,
        fields: Object.keys(fields).length,
        levelPlausibility: 0,
        score: matchRate,
      },
    ],
  };
}

/**
 * Drafts a schema from sample lines.
 *
 * Always returns something — worst case a pattern that puts the whole line
 * in `message`, which is still a working starting point.
 */
export function inferSchema(lines: string[], name = "Custom format"): InferenceResult {
  const samples = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 40);

  // Candidates come from several lines, not just the first: a banner or a
  // stack-trace fragment at the top of a file is common, and scoring below
  // is what sorts the resulting bad guesses out.
  const seeds = samples.slice(0, 6);
  const patterns = new Set<string>();
  for (const seed of seeds) {
    for (const candidate of candidatesForLine(seed)) patterns.add(candidate);
    for (const candidate of delimitedCandidates(seed)) patterns.add(candidate);
  }
  for (const candidate of UNIVERSAL_CANDIDATES) patterns.add(candidate);

  const candidates = [...patterns]
    .map((pattern) => scoreCandidate(pattern, samples))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.matchRate - a.matchRate ||
        a.pattern.length - b.pattern.length,
    );

  const best = candidates[0] ?? {
    pattern: "%{GREEDYDATA:message}",
    matchRate: 0,
    fields: 1,
    levelPlausibility: 0,
    score: 0,
  };

  const schema: LogSchema = {
    id: createSchemaId(),
    name,
    syntax: "pattern",
    pattern: best.pattern,
    timeFormat: "auto",
    updatedAt: Date.now(),
  };

  const compiled = compileSchema(schema, { captureOffsets: true });
  if (compiled.bindings.some((binding) => binding.field === "time")) {
    schema.timeFormat = chooseTimeFormat(compiled, samples);
  }

  return { schema, matchRate: best.matchRate, candidates };
}
