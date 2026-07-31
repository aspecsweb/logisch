import { describe, it, expect } from "vitest";
import {
  extractRecords,
  findRecordsPath,
  getPath,
  inferJsonFields,
  listPaths,
  summaryPathsFor,
} from "./json";
import { inferSchemaFromText } from "./infer";
import { previewSchema } from "./preview";

// A trimmed Tailscale audit-log export: one document, an array under
// `logs`, heterogeneous records, nanosecond timestamps.
const AUDIT_LOG = JSON.stringify({
  logs: [
    {
      action: "UPDATE",
      actor: { displayName: "Paul Pietzko", id: "ugx1", type: "USER" },
      eventGroupID: "d049facc",
      eventTime: "2026-07-28T08:30:38.280626046Z",
      origin: "ADMIN_CONSOLE",
      target: { id: "t1", name: "paulpietzko.github", property: "DNS_CONFIG", type: "TAILNET" },
      type: "CONFIG",
    },
    {
      action: "CREATE",
      actor: { displayName: "Paul Pietzko", id: "ugx1", type: "USER" },
      eventGroupID: "1fe88d83",
      eventTime: "2026-07-28T05:53:12.038142372Z",
      origin: "NODE",
      target: { id: "t2", name: "nbk-dev-10.ts.net", type: "NODE" },
      type: "CONFIG",
    },
    {
      action: "EXPIRED",
      actor: { displayName: "Tailscale service", id: "auto", type: "AUTOMATED_WORKER" },
      eventGroupID: "53c613a7",
      eventTime: "2026-07-27T15:43:24.753524537Z",
      origin: "CONTROL",
      target: { id: "t3", name: "Auth key", type: "API_KEY" },
      type: "CONFIG",
    },
  ],
});

describe("paths", () => {
  it("reads nested and bracketed paths", () => {
    const record = { a: { b: [{ c: 1 }] }, d: "x" };
    expect(getPath(record, "d")).toBe("x");
    expect(getPath(record, "a.b[0].c")).toBe(1);
    expect(getPath(record, "a.missing.c")).toBeUndefined();
  });

  it("lists scalar leaf paths for a UI to offer", () => {
    const paths = listPaths({ a: 1, b: { c: "x", d: { e: true } }, arr: [1] });
    expect(paths).toContain("a");
    expect(paths).toContain("b.c");
    expect(paths).toContain("b.d.e");
    // Arrays aren't offered — there's no single value to map.
    expect(paths).not.toContain("arr");
  });
});

describe("finding the records", () => {
  it("finds an array nested under an envelope key", () => {
    expect(findRecordsPath(JSON.parse(AUDIT_LOG))).toBe("logs");
  });

  it("treats a top-level array as the records themselves", () => {
    expect(findRecordsPath([{ a: 1 }])).toBe("");
  });

  it("prefers the largest array of objects", () => {
    const doc = { meta: [{ x: 1 }], events: [{ y: 1 }, { y: 2 }, { y: 3 }] };
    expect(findRecordsPath(doc)).toBe("events");
  });

  it("returns null when there's no array of objects", () => {
    expect(findRecordsPath({ a: 1, b: "two" })).toBeNull();
  });
});

describe("extractRecords", () => {
  it("pulls records out of a single-line document", () => {
    const { records } = extractRecords(AUDIT_LOG, "logs");
    expect(records).toHaveLength(3);
  });

  // The whole reason JSON mode exists: this file is one line, so a
  // line-oriented parser can only ever produce one entry from it.
  it("produces many records from one line of text", () => {
    expect(AUDIT_LOG.split("\n")).toHaveLength(1);
    expect(extractRecords(AUDIT_LOG, "logs").records.length).toBeGreaterThan(1);
  });

  it("falls back to one object per line for JSONL", () => {
    const jsonl = ['{"msg":"a"}', '{"msg":"b"}'].join("\n");
    expect(extractRecords(jsonl).records).toHaveLength(2);
  });

  it("reports a records path that points at nothing", () => {
    const { records, error } = extractRecords(AUDIT_LOG, "nope");
    expect(records).toHaveLength(0);
    expect(error).toContain("nope");
  });

  it("reports text that isn't JSON at all", () => {
    expect(extractRecords("just a log line").error).toBeTruthy();
  });
});

describe("field inference", () => {
  it("maps audit-log keys onto fields", () => {
    const { records } = extractRecords(AUDIT_LOG, "logs");
    const fields = inferJsonFields(records);
    expect(fields.time).toBe("eventTime");
    // `action` isn't a standard level key, but it's the field that plays
    // that role in an audit log.
    expect(fields.level).toBe("action");
    expect(fields.service).toBeTruthy();
  });

  it("collects paths across records, not just the first", () => {
    const records = [{ a: 1 }, { a: 2, message: "only here" }];
    expect(inferJsonFields(records).message).toBe("message");
  });
});

describe("summary paths", () => {
  it("leaves out identifiers", () => {
    const { records } = extractRecords(AUDIT_LOG, "logs");
    const paths = summaryPathsFor(records, new Set());
    expect(paths.some((p) => /id$/i.test(p))).toBe(false);
  });

  it("leaves out fields that are the same on every record", () => {
    const records = [
      { constant: "same", varies: "a" },
      { constant: "same", varies: "b" },
    ];
    const paths = summaryPathsFor(records, new Set());
    expect(paths).toContain("varies");
    expect(paths).not.toContain("constant");
  });

  it("keeps a field that only some records carry", () => {
    const records = [{ a: 1, only: "here" }, { a: 1 }, { a: 1 }];
    expect(summaryPathsFor(records, new Set())).toContain("only");
  });
});

describe("end to end", () => {
  it("turns a one-line audit export into one entry per event", () => {
    const { schema, matchRate } = inferSchemaFromText(AUDIT_LOG, "Audit");
    expect(schema.syntax).toBe("json");
    expect(schema.json?.recordsPath).toBe("logs");
    expect(matchRate).toBe(1);

    const preview = previewSchema(schema, AUDIT_LOG);
    expect(preview.counts.total).toBe(3);
    expect(preview.counts.ok).toBe(3);

    const first = preview.lines[0].entry!;
    expect(first.level).toBe("UPDATE");
    // Nanosecond precision truncates to milliseconds, not to NaN.
    expect(new Date(first.time).toISOString()).toBe("2026-07-28T08:30:38.280Z");
    expect(first.message).toBeTruthy();
  });

  it("still prefers a line-based pattern for text logs", () => {
    const { schema } = inferSchemaFromText(
      "2024-03-11T09:14:02Z INFO ready\n2024-03-11T09:14:03Z WARN slow",
    );
    expect(schema.syntax).toBe("pattern");
  });

  it("uses JSON mode for JSONL", () => {
    const jsonl = [
      '{"ts":"2024-03-11T09:14:02Z","level":"info","msg":"ready"}',
      '{"ts":"2024-03-11T09:14:03Z","level":"warn","msg":"slow"}',
    ].join("\n");

    const { schema } = inferSchemaFromText(jsonl);
    expect(schema.syntax).toBe("json");

    const preview = previewSchema(schema, jsonl);
    expect(preview.counts.ok).toBe(2);
    expect(preview.lines[0].entry?.message).toBe("ready");
    expect(preview.lines[1].entry?.level).toBe("warn");
  });
});
