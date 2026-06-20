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
  });
});
