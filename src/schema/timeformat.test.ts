import { describe, it, expect } from "vitest";
import {
  compileTimeFormat,
  createTimeParser,
  guessTimeFormat,
  parseAutoTimestamp,
  parseWithCompiledFormat,
} from "./timeformat";

const parse = (text: string, format: string) =>
  parseWithCompiledFormat(text, compileTimeFormat(format));

describe("format strings", () => {
  it("reads a plain local timestamp", () => {
    const epoch = parse("2024-03-11 09:14:02", "YYYY-MM-DD HH:mm:ss");
    expect(new Date(epoch).getFullYear()).toBe(2024);
    expect(new Date(epoch).getMonth()).toBe(2);
    expect(new Date(epoch).getDate()).toBe(11);
    expect(new Date(epoch).getHours()).toBe(9);
  });

  it("honours an explicit UTC offset over local time", () => {
    expect(parse("2024-03-11T09:14:02+02:00", "YYYY-MM-DD[T]HH:mm:ssZ")).toBe(
      Date.UTC(2024, 2, 11, 7, 14, 2),
    );
  });

  it("treats Z as UTC", () => {
    expect(parse("2024-03-11T09:14:02Z", "YYYY-MM-DD[T]HH:mm:ssZ")).toBe(
      Date.UTC(2024, 2, 11, 9, 14, 2),
    );
  });

  // The reason format strings exist at all: this string is a different day
  // depending on which convention the log was written with, and sniffing
  // cannot tell. Both readings must be reachable.
  it("resolves day/month ambiguity by the format, not a guess", () => {
    const dayFirst = parse("03/04/2024 00:00:00", "DD/MM/YYYY HH:mm:ss");
    const monthFirst = parse("03/04/2024 00:00:00", "MM/DD/YYYY HH:mm:ss");
    expect(new Date(dayFirst).getMonth()).toBe(3); // April
    expect(new Date(dayFirst).getDate()).toBe(3);
    expect(new Date(monthFirst).getMonth()).toBe(2); // March
    expect(new Date(monthFirst).getDate()).toBe(4);
    expect(dayFirst).not.toBe(monthFirst);
  });

  it("handles 12-hour clocks with a meridiem", () => {
    const noon = parse("2024-03-11 12:00:00 PM", "YYYY-MM-DD hh:mm:ss A");
    const midnight = parse("2024-03-11 12:00:00 AM", "YYYY-MM-DD hh:mm:ss A");
    expect(new Date(noon).getHours()).toBe(12);
    expect(new Date(midnight).getHours()).toBe(0);
  });

  it("scales fractional seconds by digit count, not digit value", () => {
    expect(new Date(parse("00:00:00.5", "HH:mm:ss.S")).getMilliseconds()).toBe(500);
    expect(new Date(parse("00:00:00.318", "HH:mm:ss.S")).getMilliseconds()).toBe(318);
  });

  it("matches any whitespace run where the format has one", () => {
    expect(
      Number.isNaN(parse("Mar  11 09:14:02", "MMM DD HH:mm:ss")),
    ).toBe(false);
  });

  it("treats bracketed text as literal", () => {
    expect(Number.isNaN(parse("2024-03-11T09:14:02", "YYYY-MM-DD[T]HH:mm:ss"))).toBe(
      false,
    );
  });

  it("rejects text that doesn't fit rather than guessing", () => {
    expect(parse("not a date", "YYYY-MM-DD")).toBeNaN();
    expect(parse("2024-13-01", "YYYY-MM-DD")).toBeNaN(); // month 13
    expect(parse("2024-01-32", "YYYY-MM-DD")).toBeNaN(); // day 32
    expect(parse("25:00:00", "HH:mm:ss")).toBeNaN(); // hour 25
  });

  it("keeps two-digit years out of the 1900s by accident", () => {
    // `new Date(24, ...)` would be 1924; the pivot puts it in 2024.
    expect(new Date(parse("24-03-11", "YY-MM-DD")).getFullYear()).toBe(2024);
    expect(new Date(parse("99-03-11", "YY-MM-DD")).getFullYear()).toBe(1999);
  });
});

describe("auto", () => {
  it("reads ISO-8601 exactly", () => {
    expect(parseAutoTimestamp("2024-03-11T09:14:02Z")).toBe(
      Date.UTC(2024, 2, 11, 9, 14, 2),
    );
  });

  it("accepts a comma as the fractional separator", () => {
    expect(parseAutoTimestamp("2024-03-11T09:14:02,318Z")).toBe(
      Date.UTC(2024, 2, 11, 9, 14, 2, 318),
    );
  });

  it("reads epoch seconds and milliseconds by width", () => {
    expect(parseAutoTimestamp("1710148442")).toBe(1710148442000);
    expect(parseAutoTimestamp("1710148442318")).toBe(1710148442318);
  });

  // A bare year is not a timestamp. Treating it as epoch seconds would put
  // the entry in 1970 and silently wreck every chart built from the file.
  it("refuses a bare 4-digit year", () => {
    expect(parseAutoTimestamp("2024")).toBeNaN();
  });

  it("assumes the current year for year-less syslog stamps", () => {
    const epoch = parseAutoTimestamp("Mar 11 09:14:02");
    expect(new Date(epoch).getFullYear()).toBe(new Date().getFullYear());
    expect(new Date(epoch).getMonth()).toBe(2);
  });

  it("reads Common Log Format dates", () => {
    expect(parseAutoTimestamp("11/Mar/2024:09:14:02 +0000")).toBe(
      Date.UTC(2024, 2, 11, 9, 14, 2),
    );
  });

  it("returns NaN for text with no timestamp in it", () => {
    expect(parseAutoTimestamp("connection reset")).toBeNaN();
    expect(parseAutoTimestamp("")).toBeNaN();
  });
});

describe("createTimeParser", () => {
  it("defaults to auto for empty or 'auto'", () => {
    expect(createTimeParser("auto")("1710148442")).toBe(1710148442000);
    expect(createTimeParser("")("1710148442")).toBe(1710148442000);
  });

  it("reads explicit epoch modes", () => {
    expect(createTimeParser("epoch")("1710148442")).toBe(1710148442000);
    expect(createTimeParser("epoch_ms")("1710148442318")).toBe(1710148442318);
  });
});

describe("guessTimeFormat", () => {
  it("finds a format that reads the sample", () => {
    const format = guessTimeFormat("11/03/2024 09:14:02");
    expect(format).not.toBeNull();
    expect(Number.isNaN(parse("11/03/2024 09:14:02", format!))).toBe(false);
  });

  it("returns null rather than inventing one", () => {
    expect(guessTimeFormat("banana")).toBeNull();
  });

  // Regression: fractional seconds used to make every ambiguous-date
  // candidate miss, so this returned null and callers fell back to `auto`
  // — whose last resort is `Date.parse`, which reads 11/03 as 3 November.
  // An eight-month error that reports itself as a success.
  it("still finds a format when the timestamp carries milliseconds", () => {
    const format = guessTimeFormat("11/03/2024 09:14:02.318");
    expect(format).not.toBeNull();

    const epoch = parse("11/03/2024 09:14:02.318", format!);
    expect(new Date(epoch).getMonth()).toBe(2); // March, not November
    expect(new Date(epoch).getDate()).toBe(11);
    expect(new Date(epoch).getMilliseconds()).toBe(318);
  });
});
