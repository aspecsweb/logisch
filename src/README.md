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
