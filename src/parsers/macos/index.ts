import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";
import { matchSyslogLine, resolveSyslogTime } from "../../utils/SyslogUtils";

export class MacOSXParser extends BaseParser {
  protected regex =
    /^[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+(?:calvisitor|authorMacBook|configd|symp)/i;

  public parse(line: string, raw: string): LogEntry | null {
    if (!this.canParse(line) && !line.includes("com.apple")) return null;

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
    const lowerMsg = message.toLowerCase();

    if (
      lowerMsg.includes("deny") ||
      lowerMsg.includes("unexpected") ||
      lowerMsg.includes("unplug")
    ) {
      return "WARN";
    }
    if (
      lowerMsg.includes("exited abnormally") ||
      lowerMsg.includes("failed")
    ) {
      return "ERROR";
    }
    return "INFO";
  }
}
