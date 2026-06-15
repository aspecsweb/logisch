import type { LogParser } from "../../core/LogParser";
import type { LogEntry } from "../../models/LogEntry";

export class ApacheParser implements LogParser {
  // Matches: [Sun Dec 04 04:47:44 2005] [notice] workerEnv.init() ok
  private regex = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/;

  private colors: Record<string, string> = {
    notice: "#10b981", // Emerald Green
    info: "#0ea5e9", // Sky Blue
    warn: "#eab308", // Yellow
    error: "#ef4444", // Red
    crit: "#b91c1c", // Dark Red
  };

  /**
   * Evaluates if a given line matches the standard Apache Error Log structure.
   * This is a non-allocating, quick match pass.
   */
  public canParse(line: string): boolean {
    return this.regex.test(line);
  }

  /**
   * Parses an Apache error log line into a normalized LogEntry entity.
   */
  public parse(line: string, raw: string): LogEntry | null {
    const match = line.match(this.regex);
    if (!match) return null;

    const [, rawTimestamp, rawLevel, message] = match;
    const level = rawLevel.trim();

    return {
      time: this.parseEpoch(rawTimestamp),
      rawTimestamp,
      level,
      service: "Apache",
      message: message.trim(),
      color: this.colors[level.toLowerCase()] || "#94a3b8", // Falls back to Slate
      raw,
    };
  }

  private parseEpoch(timestampStr: string): number {
    const parsed = Date.parse(timestampStr);
    return isNaN(parsed) ? Date.now() : parsed;
  }
}
