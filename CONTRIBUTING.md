# Contributing to Logisch

Thank you for looking into improving `logisch`! We appreciate help adding new parsers, polishing heuristics, and optimizing processing speeds.

## Code of Conduct

* Be respectful, clear, and direct.
* Focus on technical accuracy, performance, and keeping parsers lightweight.

## Adding a New Parser

To keep the ecosystem clean and scalable, all new log engines must be self-contained as a subpath module. Here is how to add one:

### 1. Create the Module Folder
Add a new directory under `src/parsers/` named after your target parser (e.g., `src/parsers/nginx/`). Inside, create an `index.ts` and a `readme.md`.

### 2. Implement the `LogParser` Interface
Your class can either implement `LogParser` directly or extend `BaseParser` if it benefits from standard level and color resolutions:

```typescript
import { BaseParser } from "../../core/BaseParser";
import type { LogEntry } from "../../models/logentry";

export class NginxParser extends BaseParser {
  protected regex = /^(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2})\s+\[([a-z]+)\]\s+(.*)$/;

  public parse(line: string, raw: string): LogEntry | null {
    const match = line.match(this.regex);
    if (!match) return null;

    const [, rawTimestamp, rawLevel, message] = match;
    const level = this.detectLevel(rawLevel);

    return {
      time: Date.parse(rawTimestamp) || Date.now(),
      rawTimestamp,
      level,
      service: "Nginx",
      message: message.trim(),
      color: this.resolveColor(level),
      raw,
    };
  }
}
```

### 3. Expose the Subpath Export

To make your new parser available as `import { NginxParser } from "logisch/nginx"`, complete these steps:

1. Update package.json under the "exports" block:

```JSON
"./nginx": {
  "types": "./dist/parsers/nginx/index.d.ts",
  "import": "./dist/parsers/nginx/index.js",
  "require": "./dist/parsers/nginx/index.cjs"
}
```
2. Update `tsup.config.ts` under the `entry` configuration object:

```JSON
"parsers/nginx/index": "src/parsers/nginx/index.ts",
```

## Development and Build Verification

Ensure your environment compiles perfectly without implicit type errors before submitting a Pull Request:
Bash

# Run compilation diagnostics and build output files

```bash
npm run build
````
