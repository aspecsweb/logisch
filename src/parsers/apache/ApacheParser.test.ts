import { describe, it, expect, beforeEach } from "vitest";
import { ApacheParser } from "./index";

describe("ApacheParser", () => {
  let parser: ApacheParser;

  beforeEach(() => {
    parser = new ApacheParser();
  });

  const rawNotice = "[Sun Dec 04 04:47:44 2005] [notice] workerEnv.init() ok";
  const rawError =
    "[Mon Dec 05 12:00:00 2005] [error] Client denied by server configuration";

  describe("canParse", () => {
    it("should return true for valid Apache logs", () => {
      expect(parser.canParse(rawNotice)).toBe(true);
      expect(parser.canParse(rawError)).toBe(true);
    });

    it("should return false for invalid logs", () => {
      expect(parser.canParse("Just a standard log string")).toBe(false);
      expect(
        parser.canParse("2005-12-04 04:47:44 notice workerEnv.init() ok"),
      ).toBe(false);
    });
  });

  describe("parse", () => {
    it("should parse a notice log entry correctly", () => {
      const result = parser.parse(rawNotice, rawNotice);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("notice");
      expect(result?.rawTimestamp).toBe("Sun Dec 04 04:47:44 2005");
      expect(result?.service).toBe("Apache");
      expect(result?.message).toBe("workerEnv.init() ok");
      expect(result?.color).toBe("#10b981"); // Emerald Green
    });

    it("should parse an error log entry correctly", () => {
      const result = parser.parse(rawError, rawError);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("error");
      expect(result?.message).toBe("Client denied by server configuration");
      expect(result?.color).toBe("#ef4444"); // Red
    });

    it("should fallback to slate color for unknown levels", () => {
      const rawCustom = "[Sun Dec 04 04:47:44 2005] [custom] some custom event";
      const result = parser.parse(rawCustom, rawCustom);
      expect(result?.level).toBe("custom");
      expect(result?.color).toBe("#94a3b8"); // Slate fallback
    });
  });
});
