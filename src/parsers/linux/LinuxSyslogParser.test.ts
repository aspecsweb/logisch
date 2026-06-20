import { describe, it, expect, beforeEach } from "vitest";
import { LinuxSyslogParser } from "./index";

describe("LinuxSyslogParser", () => {
  let parser: LinuxSyslogParser;

  beforeEach(() => {
    parser = new LinuxSyslogParser();
  });

  const rawAuthFail =
    "Jun 14 15:16:01 combo sshd(pam_unix)[19939]: authentication failure; logname= uid=0 euid=0 tty=NODEVssh ruser= rhost=218.188.2.4";
  const rawUnknown =
    "Jun 15 02:04:59 combo sshd(pam_unix)[20882]: check pass; user unknown";
  const rawNormal =
    "Jun 14 15:16:02 combo su(pam_unix)[19939]: session opened for user root by (uid=0)";

  describe("canParse", () => {
    it("should return true for valid combo host syslog lines", () => {
      expect(parser.canParse(rawAuthFail)).toBe(true);
      expect(parser.canParse(rawUnknown)).toBe(true);
    });

    it("should return false for incorrect formats or non-combo hosts", () => {
      expect(parser.canParse("Jun 14 15:16:01 otherhost sshd: test")).toBe(
        false,
      );
      expect(parser.canParse("Just random string")).toBe(false);
    });
  });

  describe("parse", () => {
    it("should parse an ERROR level for authentication failures", () => {
      const result = parser.parse(rawAuthFail, rawAuthFail);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("ERROR");
      expect(result?.service).toBe("combo/sshd(pam_unix)[19939]");
      expect(result?.message).toContain("authentication failure");

      // Validating the hardcoded 2026 logic from the parser
      const expectedTime = Date.parse("Jun 14 15:16:01 2026");
      expect(result?.time).toBe(expectedTime);
    });

    it("should parse a WARN level for unknown users", () => {
      const result = parser.parse(rawUnknown, rawUnknown);
      expect(result?.level).toBe("WARN");
      expect(result?.message).toBe("check pass; user unknown");
    });

    it("should default to INFO for standard system messages", () => {
      const result = parser.parse(rawNormal, rawNormal);
      expect(result?.level).toBe("INFO");
    });
  });
});
