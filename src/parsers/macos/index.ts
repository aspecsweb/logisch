import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";

export class MacOSXParser extends BaseParser {
  protected regex =
    /^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+(?:calvisitor|authorMacBook|configd|symp)/i;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line) && !line.includes("com.apple")) return null;

    const match = line.match(
      /^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):(.*)$/,
    );
    if (!match) return null;

    const [, rawTimestamp, host, rawService, rawMessage] = match;
    const message = rawMessage.trim();
    const service = rawService.trim();

    const timeMs = Date.parse(`${rawTimestamp.replace(/\s+/g, " ")} 2026`);
    const time = isNaN(timeMs) ? Date.now() : timeMs;

    let level: "INFO" | "WARN" | "ERROR" | "DEBUG" = "INFO";
    const lowerMsg = message.toLowerCase();

    if (
      lowerMsg.includes("deny") ||
      lowerMsg.includes("unexpected") ||
      lowerMsg.includes("unplug")
    ) {
      level = "WARN";
    } else if (
      lowerMsg.includes("exited abnormally") ||
      lowerMsg.includes("failed")
    ) {
      level = "ERROR";
    }

    return {
      time,
      rawTimestamp,
      level,
      service: `${host}/${service}`,
      message,
      color: this.resolveColor(level),
      raw,
    };
  }
}
