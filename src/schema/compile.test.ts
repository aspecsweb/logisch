import { describe, it, expect } from "vitest";
import { compileSchema, scanPattern } from "./compile";
import { applySchema } from "./parser";
import type { LogSchema } from "./types";

const schema = (overrides: Partial<LogSchema>): LogSchema => ({
  id: "t",
  name: "test",
  syntax: "pattern",
  pattern: "",
  timeFormat: "auto",
  updatedAt: 0,
  ...overrides,
});

const compileOf = (pattern: string, overrides: Partial<LogSchema> = {}) =>
  compileSchema(schema({ pattern, ...overrides }), { captureOffsets: true });

const errorsOf = (pattern: string) =>
  compileOf(pattern).issues.filter((issue) => issue.severity === "error");

describe("scanPattern", () => {
  it("splits literals from tokens with offsets", () => {
    const { segments } = scanPattern("[%{LEVEL:level}] x");
    expect(segments.map((s) => s.kind)).toEqual(["literal", "token", "literal"]);
    expect(segments[1]).toMatchObject({ token: "LEVEL", field: "level", start: 1 });
  });

  it("falls back to a token's default field", () => {
    const { segments } = scanPattern("%{TIMESTAMP}");
    expect(segments[0]).toMatchObject({ token: "TIMESTAMP", field: "time" });
  });

  it("flags an unknown token", () => {
    expect(errorsOf("%{NOPE:level}")[0].message).toContain("Unknown token");
  });

  it("flags a capture bound to something that isn't a field", () => {
    expect(errorsOf("%{WORD:banana}")[0].message).toContain("isn't a field");
  });

  it("flags an unclosed token instead of matching it literally", () => {
    expect(errorsOf("%{LEVEL")[0].message).toContain("Unclosed");
  });
});

describe("compileSchema", () => {
  it("matches a line and binds each field", () => {
    const compiled = compileOf(
      "%{TIMESTAMP:time} [%{LEVEL:level}] %{NOTSPACE:service} - %{GREEDYDATA:message}",
    );
    const line = "2024-03-11T09:14:02Z [ERROR] checkout-api - payment declined";
    const result = applySchema(compiled, line, line);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.level).toBe("ERROR");
    expect(result.entry.service).toBe("checkout-api");
    expect(result.entry.message).toBe("payment declined");
    expect(result.entry.time).toBe(Date.UTC(2024, 2, 11, 9, 14, 2));
  });

  // Literal text is user input. Without escaping, a pattern containing `.`
  // or `(` would silently become a wildcard or a syntax error.
  it("escapes regex metacharacters in literal text", () => {
    const compiled = compileOf("a.b %{GREEDYDATA:message}");
    expect(applySchema(compiled, "axb rest", "axb rest").status).toBe("no-match");
    expect(applySchema(compiled, "a.b rest", "a.b rest").status).toBe("ok");
  });

  it("does not choke on literal parens or brackets", () => {
    expect(errorsOf("(%{LEVEL:level}) %{GREEDYDATA:message}")).toEqual([]);
    const compiled = compileOf("(%{LEVEL:level}) %{GREEDYDATA:message}");
    expect(applySchema(compiled, "(WARN) disk low", "(WARN) disk low").status).toBe(
      "ok",
    );
  });

  it("matches any whitespace run where the pattern has one space", () => {
    const compiled = compileOf("%{LEVEL:level} %{GREEDYDATA:message}");
    const line = "INFO      padded out";
    const result = applySchema(compiled, line, line);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.message).toBe("padded out");
  });

  it("anchors at the start so a prefix pattern still works", () => {
    const compiled = compileOf("%{LEVEL:level}");
    const line = "WARN trailing text nobody asked about";
    const result = applySchema(compiled, line, line);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.level).toBe("WARN");
    // No message binding — the whole line stands in.
    expect(result.entry.message).toBe(line);
  });

  it("rejects the same field captured twice", () => {
    expect(errorsOf("%{WORD:level} %{WORD:level}")[0].message).toContain(
      "captured twice",
    );
  });

  it("warns when two open-ended tokens sit next to each other", () => {
    const warnings = compileOf(
      "%{DATA:service} %{GREEDYDATA:message}",
    ).issues.filter((issue) => issue.severity === "warning");
    expect(warnings.some((w) => w.message.includes("open-ended"))).toBe(true);
  });

  it("warns when nothing captures time", () => {
    const compiled = compileOf("%{LEVEL:level} %{GREEDYDATA:message}");
    expect(
      compiled.issues.some((issue) => issue.message.includes("Nothing captures time")),
    ).toBe(true);
    expect(compiled.ok).toBe(true); // a warning must not block
  });

  it("reports an empty pattern as an error rather than matching everything", () => {
    const compiled = compileOf("");
    expect(compiled.ok).toBe(false);
    expect(compiled.regex).toBeNull();
  });
});

describe("regex syntax", () => {
  it("binds fields from named groups", () => {
    const compiled = compileOf(
      "^(?<time>\\S+) (?<level>\\w+) (?<message>.*)$",
      { syntax: "regex" },
    );
    const line = "2024-03-11T09:14:02Z WARN disk almost full";
    const result = applySchema(compiled, line, line);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.level).toBe("WARN");
    expect(result.entry.message).toBe("disk almost full");
  });

  it("reports an invalid regex instead of throwing", () => {
    const compiled = compileOf("(?<level>", { syntax: "regex" });
    expect(compiled.ok).toBe(false);
    expect(compiled.issues[0].severity).toBe("error");
  });

  it("errors when no group names a field", () => {
    const compiled = compileOf("(?<nope>\\w+)", { syntax: "regex" });
    expect(compiled.ok).toBe(false);
    expect(compiled.issues.some((i) => i.message.includes("No named groups"))).toBe(
      true,
    );
  });
});

describe("levelMap and skipPattern", () => {
  it("rewrites levels case-insensitively", () => {
    const compiled = compileOf("%{LEVEL:level} %{GREEDYDATA:message}", {
      levelMap: { e: "ERROR" },
    });
    const result = applySchema(compiled, "E boom", "E boom");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.level).toBe("ERROR");
  });

  // A level is whatever the parser found — `[c++]` is a real case from the
  // Apache parser. It must survive as a level and never reach a RegExp.
  it("passes an unmapped, punctuation-heavy level through verbatim", () => {
    const compiled = compileOf("[%{LEVEL:level}] %{GREEDYDATA:message}");
    const result = applySchema(compiled, "[c++] built ok", "[c++] built ok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.level).toBe("c++");
  });

  it("drops lines matching the skip pattern", () => {
    const compiled = compileOf("%{GREEDYDATA:message}", { skipPattern: "^#" });
    expect(applySchema(compiled, "# banner", "# banner").status).toBe("skipped");
    expect(applySchema(compiled, "real line", "real line").status).toBe("ok");
  });
});

describe("timestamps that don't fit", () => {
  // The distinction that makes the builder useful: the pattern is right,
  // the time format is wrong, and those have completely different fixes.
  it("reports bad-time separately from no-match", () => {
    const compiled = compileOf("%{NOTSPACE:time} %{GREEDYDATA:message}", {
      timeFormat: "YYYY-MM-DD",
    });
    const result = applySchema(compiled, "banana went wrong", "banana went wrong");
    expect(result.status).toBe("bad-time");
    if (result.status !== "bad-time") return;
    expect(result.rawTimestamp).toBe("banana");
  });

  it("uses time 0 when no field captures time at all", () => {
    const compiled = compileOf("%{LEVEL:level} %{GREEDYDATA:message}");
    const result = applySchema(compiled, "INFO hello", "INFO hello");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.time).toBe(0);
  });
});
