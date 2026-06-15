import type { LogEntry } from "../models/LogEntry";

export interface LogParser {
  canParse(line: string): boolean;
  parse(line: string, raw: string): LogEntry | null;
}
