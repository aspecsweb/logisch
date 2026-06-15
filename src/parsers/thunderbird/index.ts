import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";

export class ThunderbirdParser extends BaseParser {
  protected regex = /^-\s+\d{10}\s+\d{4}\.\d{2}\.\d{2}\s+/;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line)) return null;

    const match = line.match(
      /^-\s+(\d+)\s+[\d.]+\s+(\S+)\s+[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+(\S+)\s+([^:]+):(.*)$/,
    );
    if (!match) return null;

    const [, epochStr, node, rawService, rawMessage] = match;
    const message = rawMessage.trim();
    const service = rawService.trim();

    const time = parseInt(epochStr, 10) * 1000;

    let level: "INFO" | "WARN" | "ERROR" | "DEBUG" = "INFO";
    const lowerMsg = message.toLowerCase();

    if (
      lowerMsg.includes("got not answer") ||
      lowerMsg.includes("failed") ||
      lowerMsg.includes("error")
    ) {
      level = "ERROR";
    } else if (
      lowerMsg.includes("warning") ||
      lowerMsg.includes("disconnected")
    ) {
      level = "WARN";
    }

    return {
      time,
      rawTimestamp: epochStr,
      level,
      service: `Thunderbird/${node}/${service}`,
      message,
      color: this.resolveColor(level),
      raw,
    };
  }
}
