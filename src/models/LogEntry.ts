export interface LogEntry {
  time: number;
  rawTimestamp: string;
  level: string;
  service: string;
  message: string;
  color: string;
  pid?: string;
  tid?: string;
  tag?: string;
  raw: string;
}
