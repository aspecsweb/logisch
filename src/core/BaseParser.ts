// src/parser/BaseParser.ts
import type { LogParser } from "./LogParser";
import { stringToHslColor } from "../utils/ColorUtils";
import type { LogEntry } from "../models/LogEntry";
import { getLevelColor } from "../utils/LevelColors";

export abstract class BaseParser implements LogParser {
  protected abstract regex: RegExp;

  // Maps a raw level token or message content to a normalized level string.
  // Returns the canonical uppercase form for known levels, preserving casing
  // for anything unrecognized so the dynamic color/filter system can handle it.
  protected detectLevel(text?: string, fallbackMsg?: string): string {
    if (text) {
      const u = text.toUpperCase();
      if (/\b(FATAL|CRITICAL|CRIT|EMERG|ALERT)\b/.test(u)) return "FATAL";
      if (/\b(ERROR|ERR|SEVERE)\b/.test(u)) return "ERROR";
      if (/\b(WARN|WARNING)\b/.test(u)) return "WARN";
      if (/\b(NOTICE)\b/.test(u)) return "NOTICE";
      if (/\b(DEBUG|TRACE|FINE|VERBOSE)\b/.test(u)) return "DEBUG";
      if (/\b(INFO|INFORMATION)\b/.test(u)) return "INFO";
      // Unknown but explicit token — return as-is so the UI can display it
      return text.trim().toUpperCase();
    }

    if (fallbackMsg) {
      const u = fallbackMsg.toUpperCase();
      if (
        /\b(FATAL|EXCEPTION|CRITICAL FAILURE)\b|\bFAILED\b(?!\s+TO\s+FIND)/.test(
          u,
        )
      )
        return "ERROR";
    }

    return "INFO";
  }

  protected resolveColor(level: string): string {
    return getLevelColor(level) || stringToHslColor(level);
  }

  public canParse(line: string): boolean {
    return this.regex.test(line);
  }

  public abstract parse(line: string, raw: string): LogEntry | null;
}
