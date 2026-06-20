import { describe, it, expect, beforeEach } from "vitest";
import { BGLParser } from "./index";

describe("BGLParser", () => {
  let parser: BGLParser;

  beforeEach(() => {
    parser = new BGLParser();
  });

  // BGL Format: AlertFlag Epoch Date Node Date Node RAS Layer Level Message
  const rawNormal =
    "- 1117838570 2005.06.03 R02-M1-N0-C:J12-U11 2005-06-03-15.42.50.363779 R02-M1-N0-C:J12-U11 RAS KERN INFO instruction cache parity error corrected";
  const rawAlert =
    "* 1117838570 2005.06.03 R02-M1-N0-C:J12-U11 2005-06-03-15.42.50.363779 R02-M1-N0-C:J12-U11 RAS KERN INFO temperature threshold exceeded";

  describe("canParse", () => {
    it("should return true for valid BGL logs", () => {
      expect(parser.canParse(rawNormal)).toBe(true);
      expect(parser.canParse(rawAlert)).toBe(true);
    });

    it("should return false for invalid logs", () => {
      expect(
        parser.canParse("[Sun Dec 04 04:47:44 2005] [notice] Apache log"),
      ).toBe(false);
    });
  });

  describe("parse", () => {
    it("should parse a standard BGL entry without alerts", () => {
      const result = parser.parse(rawNormal, rawNormal);
      expect(result).not.toBeNull();
      expect(result?.time).toBe(1117838570 * 1000); // Converted to ms
      expect(result?.rawTimestamp).toBe("1117838570");
      expect(result?.level).toBe("INFO");
      expect(result?.service).toBe("KERN/R02-M1-N0-C:J12-U11");
      expect(result?.message).toBe("instruction cache parity error corrected");
    });

    it("should upgrade INFO to WARN if the alert flag is present", () => {
      const result = parser.parse(rawAlert, rawAlert);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("WARN");
      expect(result?.message).toContain("[ALERT_CAT: *]");
      expect(result?.message).toContain("temperature threshold exceeded");
    });
  });
});
