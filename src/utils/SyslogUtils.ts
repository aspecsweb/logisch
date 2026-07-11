// Shared parsing helpers for the classic BSD syslog line shape used by
// several loghub-style datasets (Linux, macOS, OpenSSH): the year is absent
// from the timestamp, and the remainder of the line is `host service: message`.
const SYSLOG_LINE_REGEX =
  /^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):(.*)$/;

export interface SyslogLineParts {
  rawTimestamp: string;
  host: string;
  service: string;
  message: string;
}

export function matchSyslogLine(line: string): SyslogLineParts | null {
  const match = line.match(SYSLOG_LINE_REGEX);
  if (!match) return null;

  const [, rawTimestamp, host, service, message] = match;
  return { rawTimestamp, host, service: service.trim(), message: message.trim() };
}

// BSD syslog timestamps carry no year, so we assume the current year at
// parse time. This matches how these datasets are consumed (fresh ingestion)
// rather than pinning to a year that would go stale.
export function resolveSyslogTime(rawTimestamp: string): number {
  const year = new Date().getFullYear();
  const parsed = Date.parse(`${rawTimestamp.replace(/\s+/g, " ")} ${year}`);
  return isNaN(parsed) ? Date.now() : parsed;
}
