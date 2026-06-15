import { BaseParser } from "../../core/BaseParser";
import type { LogEntry } from "../../models/LogEntry";
import { stringToHslColor } from "../../utils/ColorUtils";

export class SparkParser extends BaseParser {
  protected regex =
    /^(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2})\s+([A-Z]+)\s+([^:]+):\s+(.*)$/;

  public parse(line: string, raw: string): LogEntry | null {
    const match = this.regex.exec(line);
    if (!match) return null;

    const rawTimestamp = match[1];
    const rawLevel = match[2];
    const service = match[3];
    const message = match[4];

    const [datePart, timePart] = rawTimestamp.split(" ");
    const [yy, mm, dd] = datePart.split("/").map(Number);
    const [hour, min, sec] = timePart.split(":").map(Number);

    const year = 2000 + yy;
    const time = new Date(year, mm - 1, dd, hour, min, sec).getTime();

    const level = this.detectLevel(rawLevel, message);
    const color = stringToHslColor(level);

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
