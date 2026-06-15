import type { LogEntry } from "../../models/LogEntry";
import { BaseParser } from "../../core/BaseParser";

export class BGLParser extends BaseParser {
  protected regex =
    /^(\S+)\s+(\d+)\s+\S+\s+(\S+)\s+\S+\s+\S+\s+RAS\s+(\S+)\s+(\S+)\s+(.*)$/;

  public parse(line: string, raw: string): LogEntry | null {
    const m = line.match(this.regex);
    if (!m) return null;

    const alertFlag = m[1];
    const epochString = m[2];
    const architectureNode = m[3];
    const layer = m[4];
    const rawLevel = m[5];
    const logMessage = m[6];

    const time = parseInt(epochString, 10) * 1000;
    const isAlert = alertFlag !== "-";
    const cleanLevel = this.detectLevel(rawLevel);
    const resolvedLevel =
      isAlert && cleanLevel === "INFO" ? "WARN" : cleanLevel;

    return {
      time,
      rawTimestamp: epochString,
      level: resolvedLevel,
      service: `${layer}/${architectureNode}`,
      message: isAlert ? `[ALERT_CAT: ${alertFlag}] ${logMessage}` : logMessage,
      color: this.resolveColor(resolvedLevel),
      raw,
    };
  }
}
