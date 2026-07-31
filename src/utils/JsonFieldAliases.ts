// Key aliases used across common structured-logging libraries (pino,
// bunyan, winston, logrus, zap, serilog, ...). Matched case-insensitively.
//
// Shared by the JSON parser and by the schema engine's JSON mode, which
// need the same vocabulary for different jobs: the parser maps one object
// per line, the schema engine maps records pulled out of a document and
// uses these to *suggest* a mapping the user can then correct.

export const TIMESTAMP_KEYS = [
  "timestamp",
  "time",
  "ts",
  "@timestamp",
  "datetime",
  "date",
  "eventtime",
  "@t",
];

export const LEVEL_KEYS = [
  "level",
  "severity",
  "lvl",
  "loglevel",
  "log.level",
  "levelname",
  "@l",
];

export const MESSAGE_KEYS = [
  "message",
  "msg",
  "text",
  "event",
  "short_message",
  "@m",
];

export const SERVICE_KEYS = [
  "service",
  "logger",
  "name",
  "component",
  "module",
  "source",
  "channel",
  "app",
];

export const PID_KEYS = ["pid", "process", "processid", "process_id"];
export const TID_KEYS = ["tid", "thread", "threadid", "thread_id"];
export const TAG_KEYS = ["tag", "category"];

// pino/bunyan and syslog emit numeric severities; map them to canonical names.
export const NUMERIC_LEVELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};
