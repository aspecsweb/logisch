import type { LogParser } from "../../core/LogParser";
import type { LogEntry } from "../../models/LogEntry";
import { getLevelColor } from "../../utils/LevelColors";

export class AndroidParser implements LogParser {
  private formatARegex =
    /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s*(.*)$/;
  private formatBRegex =
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+-\d+)\s+(\S+)\s+(?:\S+\s+)?([VDIWEF])\s+(.*)$/;

  public canParse(line: string): boolean {
    return this.formatARegex.test(line) || this.formatBRegex.test(line);
  }

  public parse(line: string, raw: string): LogEntry | null {
    let match = line.match(this.formatARegex);

    if (match) {
      const [, timestamp, pid, tid, priority, tag, message] = match;
      return {
        time: this.parseMockEpoch(timestamp),
        rawTimestamp: timestamp,
        level: priority,
        service: tag.trim(),
        message: message.trim(),
        color: getLevelColor(priority),
        pid,
        tid,
        tag: tag.trim(),
        raw,
      };
    }

    match = line.match(this.formatBRegex);
    if (match) {
      const [, timestamp, pidTid, tag, priority, message] = match;
      const [pid, tid] = pidTid.split("-");
      return {
        time: new Date(timestamp).getTime() || Date.now(),
        rawTimestamp: timestamp,
        level: priority,
        service: tag.trim(),
        message: message.trim(),
        color: getLevelColor(priority),
        pid,
        tid,
        tag: tag.trim(),
        raw,
      };
    }

    return null;
  }

  private parseMockEpoch(ts: string): number {
    try {
      const currentYear = new Date().getFullYear();
      return new Date(`${currentYear}-${ts}`).getTime() || Date.now();
    } catch {
      return Date.now();
    }
  }
}
