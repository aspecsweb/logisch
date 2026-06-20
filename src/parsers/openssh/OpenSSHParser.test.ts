import { describe, it, expect, beforeEach } from "vitest";
import { OpenSSHParser } from "./index";

describe("OpenSSHParser", () => {
  let parser: OpenSSHParser;

  beforeEach(() => {
    parser = new OpenSSHParser();
  });

  const rawFatalBreakIn =
    "Dec 10 06:55:46 dsldevice sshd[29906]: reverse mapping checking getaddrinfo for host failed - POSSIBLE BREAK-IN ATTEMPT!";
  const rawError =
    "Dec 10 06:55:46 dsldevice sshd[29906]: Failed password for root from 218.188.2.4 port 38312 ssh2";

  describe("parse", () => {
    it("should parse a FATAL break-in attempt", () => {
      const result = parser.parse(rawFatalBreakIn, rawFatalBreakIn);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("FATAL");
      expect(result?.service).toBe("dsldevice/sshd[29906]");
    });

    it("should parse an ERROR for failed passwords", () => {
      const result = parser.parse(rawError, rawError);
      expect(result?.level).toBe("ERROR");
      expect(result?.message).toContain("Failed password for root");
    });
  });
});
