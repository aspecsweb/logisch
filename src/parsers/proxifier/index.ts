import { BaseParser } from "../../core/BaseParser";
import type { LogEntry } from "../../models/LogEntry";
import { stringToHslColor } from "../../utils/ColorUtils";

export class ProxifierParser extends BaseParser {
  protected regex =
    /^\[(\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2})\]\s+([^\s-]+)\s+-\s+(.*)$/;

  public parse(line: string, raw: string): LogEntry | null {
    const match = this.regex.exec(line);
    if (!match) return null;

    const rawTimestamp = match[1];
    const service = match[2];
    const message = match[3];

    const [datePart, timePart] = rawTimestamp.split(" ");
    const [month, day] = datePart.split(".").map(Number);
    const [hour, min, sec] = timePart.split(":").map(Number);

    const year = new Date().getFullYear();
    const time = new Date(year, month - 1, day, hour, min, sec).getTime();

    const level = this.detectLevel(undefined, message);
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
