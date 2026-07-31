// Schema: user-defined log formats.
//
// For when a log doesn't match any built-in parser and the person holding
// the file is the person who knows its format. A schema is serializable
// JSON describing how to read a line; `compileSchema` turns it into a
// `LogParser` that drops into the same registry as everything else.
//
//   const { schema } = inferSchema(splitLines(text));   // draft from a sample
//   const preview = previewSchema(schema, lines);       // what it would do
//   const parser = new SchemaParser(compileSchema(schema));
//
// The pattern DSL is grok-shaped — `%{TOKEN}` or `%{TOKEN:field}`, literal
// text in between, whitespace matched flexibly — with a raw-regex escape
// hatch (`syntax: "regex"`, fields from named groups).

export {
  SCHEMA_FIELDS,
  createEmptySchema,
  createSchemaId,
  parseSchemaJson,
  type LogSchema,
  type SchemaField,
  type SchemaSyntax,
} from "./types";

export {
  TOKENS,
  TOKEN_NAMES,
  lookupToken,
  type TokenDef,
} from "./tokens";

export {
  AUTO_TIME_FORMAT,
  EPOCH_MILLIS_FORMAT,
  EPOCH_SECONDS_FORMAT,
  TIME_FORMAT_TOKENS,
  compileTimeFormat,
  createTimeParser,
  guessTimeFormat,
  parseAutoTimestamp,
  parseWithCompiledFormat,
  type CompiledTimeFormat,
  type TimeParser,
} from "./timeformat";

export {
  compileSchema,
  scanPattern,
  type CompileOptions,
  type CompiledSchema,
  type FieldBinding,
  type IssueSeverity,
  type PatternSegment,
  type SchemaIssue,
} from "./compile";

export {
  SchemaParser,
  applyJsonRecord,
  applySchema,
  type FieldCapture,
  type SchemaMatch,
} from "./parser";

export {
  previewCompiled,
  previewSchema,
  splitLines,
  type FieldSample,
  type PreviewLine,
  type PreviewOptions,
  type PreviewStatus,
  type SchemaPreview,
} from "./preview";

export {
  inferSchema,
  inferSchemaFromText,
  type InferenceCandidate,
  type InferenceResult,
} from "./infer";

export {
  extractRecords,
  findRecordsPath,
  getPath,
  inferJsonFields,
  listPaths,
  summarize,
  summaryPathsFor,
  type ExtractResult,
  type JsonConfig,
  type JsonFieldMap,
  type JsonPath,
} from "./json";

export {
  patternFromRawSpans,
  patternFromSpans,
  tokenFor,
  type FieldSpan,
  type RawSpan,
} from "./paint";
