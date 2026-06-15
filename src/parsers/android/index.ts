import type { LogParser } from "../../core/LogParser";
import type { LogEntry } from "../../models/LogEntry";
import { stringToHslColor } from "../../utils/ColorUtils";

export class AndroidParser implements LogParser {
  private formatARegex =
    /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s*(.*)$/;
  private formatBRegex =
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+-\d+)\s+(\S+)\s+(?:\S+\s+)?([VDIWEF])\s+(.*)$/;

  private colors: Record<string, string> = {
    V: "#94a3b8", // Verbose - Slate/Gray
    D: "#0ea5e9", // Debug - Sky Blue
    I: "#10b981", // Info - Emerald Green
    W: "#eab308", // Warn - Yellow
    E: "#ef4444", // Error - Red
    F: "#d946ef", // Fatal - Magenta
  };

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
        color: this.colors[priority] || stringToHslColor(priority),
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
        color: this.colors[priority] || stringToHslColor(priority),
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
