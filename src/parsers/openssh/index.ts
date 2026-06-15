import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";

export class OpenSSHParser extends BaseParser {
  protected regex =
    /^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(?:sshd|pam_unix\(sshd)/;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line)) return null;

    const match = line.match(
      /^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):(.*)$/,
    );
    if (!match) return null;

    const [, rawTimestamp, host, rawService, rawMessage] = match;
    const message = rawMessage.trim();
    const service = rawService.trim();

    const timeMs = Date.parse(`${rawTimestamp.replace(/\s+/g, " ")} 2026`);
    const time = isNaN(timeMs) ? Date.now() : timeMs;

    let level: "INFO" | "WARN" | "ERROR" | "FATAL" = "INFO";
    const upperMsg = message.toUpperCase();

    if (
      upperMsg.includes("BREAK-IN ATTEMPT") ||
      upperMsg.includes("TOO MANY AUTHENTICATION FAILURES")
    ) {
      level = "FATAL";
    } else if (
      upperMsg.includes("AUTHENTICATION FAILURE") ||
      upperMsg.includes("FAILED PASSWORD")
    ) {
      level = "ERROR";
    } else if (
      upperMsg.includes("INVALID USER") ||
      upperMsg.includes("UNKNOWN")
    ) {
      level = "WARN";
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
