import { describe, it, expect } from "vitest";
import { patternFromSpans, tokenFor } from "./paint";
import { compileSchema } from "./compile";
import { applySchema } from "./parser";

describe("tokenFor", () => {
  it("picks a token from the selected text, not just the field", () => {
    expect(tokenFor("2024-03-11T09:14:02Z", "time")).toBe("%{TIMESTAMP:time}");
    expect(tokenFor("1710148442", "time")).toBe("%{EPOCH:time}");
    expect(tokenFor("1710148442318", "time")).toBe("%{EPOCH_MS:time}");
  });

  it("uses a space-tolerant token when the selection contains spaces", () => {
    expect(tokenFor("checkout", "service")).toBe("%{NOTSPACE:service}");
    expect(tokenFor("my service", "service")).toBe("%{DATA:service}");
  });

  it("always takes the rest of the line for message", () => {
    expect(tokenFor("anything", "message")).toBe("%{GREEDYDATA:message}");
  });
});

describe("patternFromSpans", () => {
  const line = "2024-03-11T09:14:02Z [INFO] checkout - ok";

  it("keeps the text between selections as literal separators", () => {
    expect(
      patternFromSpans(line, [
        { start: 0, end: 20, field: "time" },
        { start: 22, end: 26, field: "level" },
      ]),
      // Stops just after the last selection's closing delimiter. The text
      // beyond that is real log content, and copying it would bake
      // " checkout - ok" into the pattern as a literal. Patterns anchor at
      // the start only, so a prefix like this still matches every line.
    ).toBe("%{TIMESTAMP:time} [%{LEVEL:level}]");
  });

  it("produces a pattern that parses the line it was painted on", () => {
    const pattern = patternFromSpans(line, [
      { start: 0, end: 20, field: "time" },
      { start: 22, end: 26, field: "level" },
      { start: 28, end: 36, field: "service" },
      { start: 39, end: 41, field: "message" },
    ])!;

    const compiled = compileSchema({
      id: "t",
      name: "t",
      syntax: "pattern",
      pattern,
      timeFormat: "auto",
      updatedAt: 0,
    });

    const result = applySchema(compiled, line, line);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.level).toBe("INFO");
    expect(result.entry.service).toBe("checkout");
    expect(result.entry.message).toBe("ok");
  });

  // A message that stopped where the mouse stopped would truncate every
  // line longer than the one it was painted on.
  it("extends a message selection to the end of the line", () => {
    const pattern = patternFromSpans(line, [
      { start: 28, end: 36, field: "service" },
      { start: 39, end: 40, field: "message" }, // selected just "o"
    ])!;

    const compiled = compileSchema({
      id: "t",
      name: "t",
      syntax: "pattern",
      pattern,
      timeFormat: "auto",
      updatedAt: 0,
    });

    const longer = line.replace("ok", "ok and then plenty more text");
    const result = applySchema(compiled, longer, longer);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.message).toBe("ok and then plenty more text");
  });

  // Painting one field in the middle of a line must not bake the text
  // before it into the pattern — that timestamp differs on every line, so
  // a literal copy would leave the schema matching exactly one of them.
  it("wildcards unclaimed text before the first selection", () => {
    const real = "11/03/2024 09:14:02.318 <checkout-api> {INFO} order placed";
    const pattern = patternFromSpans(real, [
      { start: real.indexOf("checkout-api"), end: real.indexOf("checkout-api") + 12, field: "service" },
    ])!;

    expect(pattern).not.toContain("11/03/2024");
    // The `>` is kept so NOTSPACE stops at the end of the field instead of
    // capturing "checkout-api>".
    expect(pattern).toBe("%{DATA}<%{NOTSPACE:service}>");

    const compiled = compileSchema({
      id: "t", name: "t", syntax: "pattern", pattern,
      timeFormat: "auto", updatedAt: 0,
    });

    // Has to match a line with a completely different timestamp and service.
    const other = "12/03/2024 23:59:59.001 <inventory> {WARN} stock low";
    const result = applySchema(compiled, other, other);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.entry.service).toBe("inventory");
  });

  it("keeps a leading delimiter without adding a wildcard", () => {
    const bracketed = "[INFO] something happened";
    expect(
      patternFromSpans(bracketed, [{ start: 1, end: 5, field: "level" }]),
    ).toBe("[%{LEVEL:level}]");
  });

  // Only matters when the `%{` falls *between* two selections, since that
  // is the only text copied into the pattern verbatim.
  it("declines rather than mangling a literal containing %{", () => {
    const awkward = "2024-03-11 %{weird} INFO rest";
    expect(
      patternFromSpans(awkward, [
        { start: 0, end: 10, field: "time" },
        { start: 20, end: 24, field: "level" },
      ]),
    ).toBeNull();
  });
});
