import { describe, it, expect, vi, afterEach } from "vitest";
import { matchSyslogLine, resolveSyslogTime } from "./SyslogUtils";

describe("SyslogUtils - matchSyslogLine", () => {
  it("should extract timestamp, host, service and message from a standard line", () => {
    const line =
      "Jun 14 15:16:01 combo sshd(pam_unix)[19939]: authentication failure";
    const parts = matchSyslogLine(line);

    expect(parts).toEqual({
      rawTimestamp: "Jun 14 15:16:01",
      host: "combo",
      service: "sshd(pam_unix)[19939]",
      message: "authentication failure",
    });
  });

  it("should only split on the first colon, preserving colons inside the message", () => {
    const line = "Jun 14 15:16:01 combo sshd[1]: port 22: connection refused";
    const parts = matchSyslogLine(line);

    expect(parts?.service).toBe("sshd[1]");
    expect(parts?.message).toBe("port 22: connection refused");
  });

  it("should preserve the raw double-space padding BSD syslog uses for single-digit days", () => {
    // "Jul  1" (two spaces) is how syslog pads day-of-month < 10, not "Jul 1"
    const line = "Jul  1 09:00:00 host proc: message";
    const parts = matchSyslogLine(line);

    expect(parts?.rawTimestamp).toBe("Jul  1 09:00:00");
  });

  it("should trim trailing whitespace from the service before the colon", () => {
    const line = "Jun 14 15:16:01 combo sshd  : message";
    const parts = matchSyslogLine(line);

    expect(parts?.service).toBe("sshd");
  });

  it("should trim leading whitespace from the message after the colon", () => {
    const line = "Jun 14 15:16:01 combo sshd:    padded message";
    const parts = matchSyslogLine(line);

    expect(parts?.message).toBe("padded message");
  });

  it("should return null for lines that don't match the classic syslog shape", () => {
    expect(matchSyslogLine("[10.25 14:32:10] chrome.exe - proxy open")).toBeNull();
    expect(matchSyslogLine("not a log line at all")).toBeNull();
  });
});

describe("SyslogUtils - resolveSyslogTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should assume the current calendar year since syslog timestamps omit it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2031, 2, 1));

    const result = resolveSyslogTime("Jun 14 15:16:01");

    expect(result).toBe(Date.parse("Jun 14 15:16:01 2031"));
  });

  it("should not pin to a hardcoded year across a year boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 1));
    const resultIn2027 = resolveSyslogTime("Jan 1 00:00:00");

    vi.setSystemTime(new Date(2028, 0, 1));
    const resultIn2028 = resolveSyslogTime("Jan 1 00:00:00");

    expect(resultIn2027).not.toBe(resultIn2028);
  });

  it("should normalize double-space day padding before parsing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 1));

    const result = resolveSyslogTime("Jul  1 09:00:00");

    expect(result).toBe(Date.parse("Jul 1 09:00:00 2030"));
  });

  it("should fall back to the current time for an unparsable timestamp", () => {
    vi.useFakeTimers();
    const fixedNow = new Date(2030, 0, 1).getTime();
    vi.setSystemTime(fixedNow);

    expect(resolveSyslogTime("not a timestamp")).toBe(fixedNow);
  });
});
