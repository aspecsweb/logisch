# JSON Parser Component (`logisch/json`)

The JSON module handles structured logs where each line is a self-contained JSON
object — the format emitted by libraries such as **pino**, **bunyan**, **winston**,
**logrus**, **zap**, and **Serilog**. It normalizes the wide variety of field
names those libraries use into a canonical structured log object.

## Field Resolution

Keys are matched case-insensitively, trying each alias in order:

| Canonical  | Aliases (first match wins)                                                     |
| ---------- | ----------------------------------------------------------------------------- |
| timestamp  | `timestamp`, `time`, `ts`, `@timestamp`, `datetime`, `date`, `eventtime`, `@t` |
| level      | `level`, `severity`, `lvl`, `loglevel`, `log.level`, `levelname`, `@l`         |
| message    | `message`, `msg`, `text`, `event`, `short_message`, `@m`                       |
| service    | `service`, `logger`, `name`, `component`, `module`, `source`, `channel`, `app` |
| pid        | `pid`, `process`, `processid`, `process_id`                                    |
| tid        | `tid`, `thread`, `threadid`, `thread_id`                                       |
| tag        | `tag`, `category`                                                             |

- **Timestamps** accept ISO-8601 strings as well as numeric epochs — 10-digit
  values are treated as seconds, larger values as milliseconds.
- **Levels** accept textual names (normalized via the shared level heuristics)
  and the numeric pino/bunyan severities (`10`=trace … `60`=fatal).
- When no recognizable message field is present, the compact JSON is surfaced as
  the message so no data is lost.

## Usage

You can import and use the `JsonParser` directly without pulling in the entire
library registry.

```typescript
import { JsonParser } from "logisch/json";

const parser = new JsonParser();
const sampleLine =
  '{"level":"info","time":1704067200000,"msg":"server started","name":"api"}';

if (parser.canParse(sampleLine)) {
  const entry = parser.parse(sampleLine, sampleLine);
  console.log(entry);
}
```
