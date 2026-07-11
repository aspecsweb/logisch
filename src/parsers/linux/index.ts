import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";
import { matchSyslogLine, resolveSyslogTime } from "../../utils/SyslogUtils";

export class LinuxSyslogParser extends BaseParser {
  protected regex = /^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+combo\s+/;

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

  private detectSyslogLevel(message: string): "INFO" | "WARN" | "ERROR" {
    const upperMsg = message.toUpperCase();

    if (
      upperMsg.includes("AUTHENTICATION FAILURE") ||
      upperMsg.includes("ALERT")
    ) {
      return "ERROR";
    }
    if (upperMsg.includes("FAILED") || upperMsg.includes("UNKNOWN")) {
      return "WARN";
    }
    return "INFO";
  }
}
