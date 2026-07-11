import { describe, it, expect, beforeEach } from "vitest";
import { WindowsCbsParser } from "./index";

describe("WindowsCbsParser", () => {
  let parser: WindowsCbsParser;

  beforeEach(() => {
    parser = new WindowsCbsParser();
  });

  const rawInfo =
    "2023-10-25 14:32:10, Info CBS Session: 31086088_527027 initialized by client";
  const rawError = "2023-10-25 14:32:11, Error CSI 0000000a (F) E_FAIL #12345";

  describe("parse", () => {
    it("should extract Windows components and CBS info", () => {
      const result = parser.parse(rawInfo, rawInfo);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("INFO");
      expect(result?.service).toBe("Windows/CBS");
      expect(result?.message).toBe(
        "Session: 31086088_527027 initialized by client",
      );
    });

    it("should map CSI errors correctly to ERROR", () => {
      const result = parser.parse(rawError, rawError);
      expect(result?.level).toBe("ERROR");
      expect(result?.service).toBe("Windows/CSI");
      expect(result?.message).toBe("0000000a (F) E_FAIL #12345");
    });

    it("should return null for lines that aren't CBS/CSI servicing entries", () => {
      const nonCbsLine = "2023-10-25 14:32:10, Info SomethingElse unrelated";
      expect(parser.canParse(nonCbsLine)).toBe(false);
      expect(parser.parse(nonCbsLine, nonCbsLine)).toBeNull();
    });

    it("should map a WARNING raw level to WARN even when the message has no keyword match", () => {
      const rawWarning =
        "2023-10-25 14:32:12, Warning CBS Component state changed, monitoring continues";
      const result = parser.parse(rawWarning, rawWarning);
      expect(result?.level).toBe("WARN");
    });

    it("should fall back to the current time when the timestamp can't be parsed", () => {
      const badTimestampLine = "9999-99-99 99:99:99, Info CBS malformed date";
      // Verify the malformed input actually reaches the fallback branch,
      // not that the regex rejects it outright.
      expect(parser.canParse(badTimestampLine)).toBe(true);

      const before = Date.now();
      const result = parser.parse(badTimestampLine, badTimestampLine);
      const after = Date.now();

      expect(result?.time).toBeGreaterThanOrEqual(before);
      expect(result?.time).toBeLessThanOrEqual(after);
    });
  });
});
