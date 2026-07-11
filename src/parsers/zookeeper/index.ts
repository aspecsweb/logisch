import { BaseParser } from "../../core/BaseParser";
import type { LogEntry } from "../../models/LogEntry";
import { localDateTimeToEpoch } from "../../utils/DateUtils";

export class ZookeeperParser extends BaseParser {
  protected regex =
    /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+-\s+([A-Z]+)\s+\[([^\]]+)\]\s+-\s+(.*)$/;

  public parse(line: string, raw: string): LogEntry | null {
    const match = this.regex.exec(line);
    if (!match) return null;

    const rawTimestamp = match[1];
    const rawLevel = match[2].trim();
    const service = match[3];
    const message = match[4];

    const [datePart, timePartCombined] = rawTimestamp.split(" ");
    const [timePart, msPart] = timePartCombined.split(",");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, min, sec] = timePart.split(":").map(Number);
    const ms = Number(msPart);

    const time = localDateTimeToEpoch(year, month, day, hour, min, sec, ms);
    const level = this.detectLevel(rawLevel, message);
    const color = this.resolveColor(level);

    return {
      time,
      rawTimestamp,
      level,
      service,
      message,
      color,
      raw,
    };
  }
}
