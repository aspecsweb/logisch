import type { LogParser } from "../../core/LogParser";
import type { LogEntry } from "../../models/LogEntry";
import { stringToHslColor } from "../../utils/ColorUtils";
import { getLevelColor } from "../../utils/LevelColors";

const TIMESTAMP_PATTERNS: Array<{
  regex: RegExp;
  parse: (m: RegExpMatchArray) => { raw: string; epoch: number };
}> = [
  {
    regex:
      /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
    parse: (m) => ({
      raw: m[1],
      epoch: new Date(m[1].replace(",", ".")).getTime(),
    }),
  },
  {
    regex: /([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,
    parse: (m) => ({
      raw: m[1],
      epoch: new Date(`${m[1]} ${new Date().getFullYear()}`).getTime(),
    }),
  },
  {
    regex: /(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/,
    parse: (m) => ({
      raw: m[1],
      epoch: new Date(`${new Date().getFullYear()}-${m[1]}`).getTime(),
    }),
  },
  {
    regex: /(\d{2,4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/,
    parse: (m) => ({
      raw: m[1],
      epoch: new Date(m[1].replace(/\//g, "-")).getTime(),
    }),
  },
  {
    regex: /\b(\d{13})\b/,
    parse: (m) => ({ raw: m[1], epoch: parseInt(m[1], 10) }),
  },
  {
    regex: /\b(\d{10})\b/,
    parse: (m) => ({ raw: m[1], epoch: parseInt(m[1], 10) * 1000 }),
  },
];

const LEVEL_PATTERNS: Array<{ regex: RegExp; level: string }> = [
  { regex: /\b(FATAL|CRITICAL|EMERG|ALERT|CRIT)\b/i, level: "FATAL" },
  { regex: /\b(ERROR|ERR|EXCEPTION|SEVERE)\b/i, level: "ERROR" },
  { regex: /\b(WARN(?:ING)?|NOTICE)\b/i, level: "WARN" },
  { regex: /\b(INFO(?:RMATION)?)\b/i, level: "INFO" },
  { regex: /\b(DEBUG|TRACE|VERBOSE|FINE)\b/i, level: "DEBUG" },
];

function extractLevel(line: string): string {
  for (const { regex, level } of LEVEL_PATTERNS) {
    if (regex.test(line)) return level;
  }
  return "INFO";
}

function extractService(line: string, timestampRaw: string): string {
  const after = line
    .slice(line.indexOf(timestampRaw) + timestampRaw.length)
    .trim();

  // Fixed ESLint: Removed useless \[ and moved the hyphen to the end of the class
  const bracketed = after.match(/^[[({]\s*([A-Za-z0-9._/-]+)\s*[\])}]/);
  if (bracketed) return bracketed[1];

  // Fixed ESLint: Moved the hyphen to the end of the class
  const beforeColon = after.match(/^([A-Za-z][A-Za-z0-9._-]{2,40}):/);
  if (
    beforeColon &&
    !LEVEL_PATTERNS.some(({ regex }) => regex.test(beforeColon[1]))
  ) {
    return beforeColon[1];
  }
  return "";
}

export class FallbackParser implements LogParser {
  public canParse(_line: string): boolean {
    return true;
  }

  public parse(line: string, raw: string): LogEntry | null {
    for (const { regex, parse } of TIMESTAMP_PATTERNS) {
      const m = line.match(regex);
      if (!m) continue;

      const { raw: rawTimestamp, epoch } = parse(m);
      if (!epoch || isNaN(epoch)) continue;

      const level = extractLevel(line);
      const service = extractService(line, rawTimestamp);
      const color = getLevelColor(level) || stringToHslColor(level);

      return {
        time: epoch,
        rawTimestamp,
        level,
        service,
        message: line,
        color,
        raw,
      };
    }
    return null;
  }
}
