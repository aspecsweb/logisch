# Parsers Architecture & Data Mechanics

This directory contains the core log processing modules for the `logisch` engine. The library is built around a non-allocating, quick-matching strategy to parse files containing thousands of lines efficiently without causing UI freezes or heavy memory pressure.

## Architecture Blueprint

```text
Raw Log File Content
       │
       ▼
Split into String Lines -> Cleaned / Normalized
       │
       ▼
Parser Registry Ring (Evaluated Top-to-Bottom)
 ├── 1. AndroidParser.canParse()     ?? ──► (False, skip allocation)
 ├── 2. ApacheParser.canParse()      ?? ──► (False, skip allocation)
 ├── 3. LinuxSyslogParser.canParse() ?? ──► [ True Match ]
       │                                           │
       ▼                                           ▼
Execute Extractors Only On Match           parser.parse()
                                                   │
                                                   ▼
                                         Returns Canonical LogEntry
                                                   │
                                                   ▼
                                        Pushed to UI & Timeline
```

If no parser in the registry matches, `FallbackParser` (see `parsers/fallback`) always
returns `true` from `canParse()` and heuristically extracts a timestamp/level/service,
so a `LogEntry` is still produced for unrecognized formats.

## Directory Layout

- `core/` — Shared contracts and base class
  - [`LogParser.ts`](./core/LogParser.ts) — the `canParse(line)` / `parse(line, raw)` interface every parser implements
  - [`BaseParser.ts`](./core/BaseParser.ts) — abstract base providing `detectLevel()` (keyword-based level inference) and `resolveColor()` (mapped color lookup with HSL-hash fallback); most parsers extend this, a few (e.g. `AndroidParser`, `ApacheParser`) implement `LogParser` directly when their level/color rules don't fit the generic heuristics
- `models/` — [`LogEntry.ts`](./models/LogEntry.ts), the canonical output shape all parsers return
- `utils/` — Cross-parser helpers
  - `ColorUtils.ts` — deterministic HSL hash fallback for unmapped levels
  - `LevelColors.ts` — the shared level → color map plus `getLevelColor()` / `getLevelLabel()`
  - `SyslogUtils.ts` — shared regex/time resolution for classic BSD syslog lines (used by `linux`, `macos`, `openssh`)
  - `DateUtils.ts` — `localDateTimeToEpoch()` for parsers that hand-split delimited timestamps (`proxifier`, `spark`, `zookeeper`)
- `parsers/<name>/` — One self-contained module per log format, each with its own `index.ts`, unit tests, and `README.md` (see [../README.md](../README.md) for the full list and subpath import instructions)

## Adding a Parser

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full walkthrough (module scaffolding, subpath export wiring, build verification).
