# Schema Component (`logisch/schema`)

For logs that no built-in parser recognises — the ones written by *your*
services, in *your* format. A schema is plain JSON describing how to read a
line; `compileSchema` turns it into a `LogParser` that drops into the same
registry as everything else.

Because a schema is data rather than code, it survives `postMessage` into a
Web Worker, and it can be exported, committed, and shared with the rest of
the team.

## Usage

```typescript
import {
  inferSchema,
  previewSchema,
  compileSchema,
  SchemaParser,
  splitLines,
} from "logisch/schema";

const lines = splitLines(fileText);

// 1. Draft a schema from the file itself, rather than a blank box.
const { schema, matchRate } = inferSchema(lines);

// 2. See exactly what it would do, line by line, before committing to it.
const preview = previewSchema(schema, lines);
console.log(preview.matchRate, preview.counts, preview.failures);

// 3. Parse with it.
const parser = new SchemaParser(compileSchema(schema));
```

## The pattern DSL

Grok-shaped: `%{TOKEN}` or `%{TOKEN:field}`, with literal text in between.

```
%{TIMESTAMP:time} [%{LEVEL:level}] %{NOTSPACE:service} - %{GREEDYDATA:message}
```

- Literal text is matched literally and is regex-escaped for you, so `.`,
  `[` and `(` mean what they look like.
- **Whitespace is flexible** — one space in a pattern matches any run in the
  input, because column-aligned logs pad to width.
- Patterns anchor at the start only, so a pattern describing a prefix is
  valid; the tail is ignored.
- Tokens have sensible default fields, so `%{TIMESTAMP}` binds `time`
  without being told.

Fields are `time`, `level`, `service`, `message`, `pid`, `tid`, `tag`.
Unbound `message` falls back to the whole line; unbound `level` to `INFO`.

Run `TOKENS` to enumerate the vocabulary — each entry carries a hint and an
example, so a palette UI can be generated from it rather than hand-written.

### Raw regex

Set `syntax: "regex"` and name your groups after the fields:

```typescript
{ syntax: "regex", pattern: "^(?<time>\\S+) (?<level>\\w+) (?<message>.*)$" }
```

## Timestamps

`timeFormat` is `auto`, `epoch`, `epoch_ms`, or a format string
(`YYYY-MM-DD HH:mm:ss,SSS`). `auto` handles most logs.

The reason format strings exist: **`03/04/2024` is a different day** under
`DD/MM/YYYY` than under `MM/DD/YYYY`, and nothing in the text says which.
`auto`'s last resort is `Date.parse`, which quietly applies the US
month-first reading and returns a valid — possibly eight-months-wrong —
date. `inferSchema` therefore commits to an explicit format whenever it
sees an ambiguous numeric date, so the choice is visible and correctable
rather than silently wrong.

A timestamp with no offset is read as **local time**; an explicit offset in
the text always wins. A year-less stamp (`Mar 11 09:14:02`) assumes the
current year, matching `resolveSyslogTime`.

## Why the preview matters

`previewSchema` reports per line whether it parsed, and distinguishes:

| Status | Meaning |
|---|---|
| `ok` | Parsed. |
| `no-match` | The pattern didn't fit this line. |
| `bad-time` | The pattern fit, but the timestamp didn't parse. |
| `skipped` | Dropped by `skipPattern`. |

`bad-time` is deliberately separate from `no-match` because the fixes are
completely different — the pattern is right and the *time format* is wrong.

`fieldSamples` reports what each field actually captured, which is how you
notice that `service` is quietly eating the log level.

Lines whose timestamp won't parse are reported rather than kept at epoch 0:
a single 1970 entry stretches a chart's x-axis across half a century.
