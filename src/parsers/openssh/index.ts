import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";
import { matchSyslogLine, resolveSyslogTime } from "../../utils/SyslogUtils";

export class OpenSSHParser extends BaseParser {
  protected regex =
    /^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(?:sshd|pam_unix\(sshd)/;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line)) return null;

    const parts = matchSyslogLine(line);
    if (!parts) return null;

    const { rawTimestamp, host, service, message } = parts;
    const level = this.detectSyslogLevel(message);

    return {
      time: resolveSyslogTime(rawTimestamp),
      rawTimestamp,
      level,
      service: `${host}/${service}`,
      message,
      color: this.resolveColor(level),
      raw,
    };
  }

  private detectSyslogLevel(
    message: string,
  ): "INFO" | "WARN" | "ERROR" | "FATAL" {
    const upperMsg = message.toUpperCase();

    if (
      upperMsg.includes("BREAK-IN ATTEMPT") ||
      upperMsg.includes("TOO MANY AUTHENTICATION FAILURES")
    ) {
      return "FATAL";
    }
    if (
      upperMsg.includes("AUTHENTICATION FAILURE") ||
      upperMsg.includes("FAILED PASSWORD")
    ) {
      return "ERROR";
    }
    if (upperMsg.includes("INVALID USER") || upperMsg.includes("UNKNOWN")) {
      return "WARN";
    }
    return "INFO";
  }
}
