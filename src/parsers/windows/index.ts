import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";

export class WindowsCbsParser extends BaseParser {
  protected regex =
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\s+\S+\s+(?:CBS|CSI)\s+/;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line)) return null;

    const match = line.match(
      /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}),\s+(\S+)\s+(\S+)\s+(.*)$/,
    );
    if (!match) return null;

    const [, rawTimestamp, rawLevel, component, rawMessage] = match;
    const message = rawMessage.trim();

    const timeMs = Date.parse(rawTimestamp);
    const time = isNaN(timeMs) ? Date.now() : timeMs;

    let level: "INFO" | "WARN" | "ERROR" | "DEBUG" = "INFO";
    const upperMsg = message.toUpperCase();
    const upperRawLevel = rawLevel.toUpperCase();

    if (
      upperRawLevel === "ERROR" ||
      upperMsg.includes("FAILED") ||
      upperMsg.includes("E_FAIL")
    ) {
      level = "ERROR";
    } else if (
      upperRawLevel === "WARNING" ||
      upperMsg.includes("WARNING:") ||
      upperMsg.includes("UNRECOGNIZED")
    ) {
      level = "WARN";
    }

    return {
      time,
      rawTimestamp,
      level,
      service: `Windows/${component}`,
      message,
      color: this.resolveColor(level),
      raw,
    };
  }
}
