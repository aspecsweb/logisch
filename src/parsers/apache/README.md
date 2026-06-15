# Apache Parser Component (`logisch/apache`)

The Apache module isolates the regex evaluation and entry serialization required to transform standard Apache Server Error Logs into canonical structured log objects.

## Usage

You can import and use the `ApacheParser` directly without pulling in the entire library registry.

```typescript
import { ApacheParser } from "logisch/apache";

const parser = new ApacheParser();
const sampleLine = '[Sun Dec 04 04:47:44 2005] [notice] workerEnv.init() ok';

if (parser.canParse(sampleLine)) {
  const entry = parser.parse(sampleLine, sampleLine);
  console.log(entry);
}
```