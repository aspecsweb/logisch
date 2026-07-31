import { describe, it, expect } from "vitest";
import { inferSchema } from "./infer";
import { previewSchema, splitLines } from "./preview";

/** Infers from a sample, then checks how the winner does on that sample. */
function draft(text: string) {
  const result = inferSchema(splitLines(text));
  return { ...result, preview: previewSchema(result.schema, text) };
}

describe("inferSchema", () => {
  it("drafts a working pattern for an ISO + bracketed level log", () => {
    const { preview, schema } = draft(`
2024-03-11T09:14:02Z [INFO] checkout-api - order 5512 placed
2024-03-11T09:14:03Z [WARN] checkout-api - retrying payment
2024-03-11T09:14:09Z [ERROR] checkout-api - payment declined
`);

    expect(preview.matchRate).toBe(1);
    expect(schema.pattern).toContain("%{TIMESTAMP:time}");

    const first = preview.lines[0];
    expect(first.entry?.level).toBe("INFO");
    expect(first.entry?.service).toBe("checkout-api");
    // The " - " separator belongs in the pattern as literal text. Left in
    // the message it prefixes every row in the table with noise.
    expect(first.entry?.message).toBe("order 5512 placed");
  });

  it("drafts a working pattern for a logback-style log", () => {
    const { preview } = draft(`
2024-03-11 09:14:02,318 INFO  com.acme.Checkout - starting up
2024-03-11 09:14:02,904 DEBUG com.acme.Cache - warm
2024-03-11 09:14:11,022 ERROR com.acme.Checkout - gateway timeout
`);

    expect(preview.matchRate).toBe(1);
    expect(preview.lines[0].entry?.level).toBe("INFO");
    expect(preview.lines[0].entry?.service).toBe("com.acme.Checkout");
  });

  it("drafts a working pattern for syslog with a host and pid", () => {
    const { preview } = draft(`
Mar 11 09:14:02 web-01 sshd[4021]: Accepted publickey for deploy
Mar 11 09:14:44 web-02 sshd[4088]: Connection closed by 10.0.4.19
`);

    expect(preview.matchRate).toBe(1);

    const first = preview.lines[0].entry;
    expect(first?.rawTimestamp).toBe("Mar 11 09:14:02");
    expect(first?.service).toBe("sshd");
    expect(first?.pid).toBe("4021");
    expect(first?.message).toBe("Accepted publickey for deploy");
  });

  // The host varies line to line, so it has to be *captured*. Baking the
  // first line's hostname into the pattern as a literal would leave the
  // schema matching only the machine it was drafted on.
  it("captures the syslog host rather than hard-coding it", () => {
    const { schema, preview } = draft(`
Mar 11 09:14:02 web-01 sshd[4021]: Accepted publickey for deploy
Mar 11 09:14:44 web-02 sshd[4088]: Connection closed by 10.0.4.19
Mar 11 09:15:01 db-07 sshd[4102]: Accepted publickey for deploy
`);

    expect(schema.pattern).not.toContain("web-01");
    expect(preview.matchRate).toBe(1);
    expect(preview.lines[2].entry?.tag).toBe("db-07");
  });

  // The first line of a file is very often not representative. Candidates
  // are seeded from several lines and scored across the sample, so one
  // banner shouldn't decide the format.
  it("is not derailed by a banner on the first line", () => {
    const { preview } = draft(`
=== application started, build 4f21a ===
2024-03-11T09:14:02Z INFO service ready
2024-03-11T09:14:03Z INFO handling request
2024-03-11T09:14:04Z WARN slow query
2024-03-11T09:14:05Z INFO done
`);

    // The banner itself can't match a timestamped pattern; everything else must.
    expect(preview.counts.ok).toBe(4);
  });

  // `<…>` and `{…}` are delimiters too, not message text.
  it("recognises angle- and brace-delimited fields", () => {
    const { preview } = draft(`
11/03/2024 09:14:02.318 <checkout-api> {INFO} order 5512 placed
11/03/2024 09:14:03.902 <checkout-api> {WARN} retrying payment gateway
11/03/2024 09:14:09.114 <inventory> {ERROR} reservation expired
`);

    expect(preview.matchRate).toBe(1);
    const first = preview.lines[0].entry;
    expect(first?.level).toBe("INFO");
    expect(first?.service).toBe("checkout-api");
    expect(first?.message).toBe("order 5512 placed");
  });

  it("drafts a working pattern for pipe-delimited logs", () => {
    const { preview } = draft(`
2024-03-11T09:14:02Z|ERROR|billing|charge failed
2024-03-11T09:14:05Z|INFO|billing|retry scheduled
2024-03-11T09:14:09Z|WARN|shipping|address ambiguous
`);

    expect(preview.matchRate).toBe(1);
    const first = preview.lines[0].entry;
    expect(first?.level).toBe("ERROR");
    expect(first?.service).toBe("billing");
    expect(first?.message).toBe("charge failed");
  });

  // Same hazard as the syslog host: the leading client IP varies per line,
  // so copying it into the pattern as a literal would leave the schema
  // matching requests from exactly one address.
  it("captures a leading IP instead of hard-coding it", () => {
    const { schema, preview } = draft(`
10.0.4.19 - - [11/Mar/2024:09:14:02 +0000] "GET /health HTTP/1.1" 200 12
10.0.4.22 - - [11/Mar/2024:09:14:03 +0000] "POST /orders HTTP/1.1" 201 480
192.168.1.7 - - [11/Mar/2024:09:14:05 +0000] "GET /assets/app.js HTTP/1.1" 304 0
`);

    expect(schema.pattern).not.toContain("10.0.4.19");
    expect(preview.matchRate).toBe(1);

    const first = preview.lines[0].entry;
    expect(first?.service).toBe("10.0.4.19");
    // The `]` closing the timestamp belongs to the pattern, not the message.
    expect(first?.message).toBe('"GET /health HTTP/1.1" 200 12');
  });

  it("picks a time format when auto can't read the timestamp", () => {
    const { schema, preview } = draft(`
11/03/2024 09:14:02 INFO service ready
11/03/2024 09:14:03 WARN slow query
11/03/2024 09:14:04 ERROR gateway timeout
`);

    expect(schema.timeFormat).not.toBe("auto");
    expect(preview.counts["bad-time"]).toBe(0);
    expect(preview.matchRate).toBe(1);
  });

  // End-to-end guard on the worst failure mode this feature has: a date
  // that parses "successfully" into the wrong month. `Date.parse` reads
  // 11/03 as 3 November, and nothing downstream can tell.
  it("reads a day-first date as day-first, milliseconds and all", () => {
    const { schema, preview } = draft(`
11/03/2024 09:14:02.318 <checkout-api> {INFO} order 5512 placed
11/03/2024 09:14:03.902 <checkout-api> {WARN} retrying payment
11/03/2024 09:14:09.114 <inventory> {ERROR} reservation expired
`);

    expect(schema.timeFormat).not.toBe("auto");
    expect(preview.matchRate).toBe(1);

    const parsed = new Date(preview.lines[0].entry!.time);
    expect(parsed.getMonth()).toBe(2); // March
    expect(parsed.getDate()).toBe(11);
    expect(parsed.getMilliseconds()).toBe(318);
  });

  it("always returns something usable, even for shapeless input", () => {
    const { schema, preview } = draft(`
just some words
more words here
`);
    expect(schema.pattern).toBeTruthy();
    expect(preview.counts.ok).toBe(2);
    expect(preview.lines[0].entry?.message).toBe("just some words");
  });

  it("returns scored alternatives, best first", () => {
    const { candidates } = draft(`
2024-03-11T09:14:02Z INFO ready
2024-03-11T09:14:03Z WARN slow
`);
    expect(candidates.length).toBeGreaterThan(1);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].matchRate).toBeGreaterThanOrEqual(
        candidates[i].matchRate,
      );
    }
  });
});
