import { describe, it, expect, beforeEach } from "vitest";
import { FallbackParser } from "./index";

describe("FallbackParser", () => {
  let parser: FallbackParser;

  beforeEach(() => {
    parser = new FallbackParser();
  });

  describe("canParse", () => {
    it("should always return true as the safety net", () => {
      expect(parser.canParse("Literally anything")).toBe(true);
    });
  });

  describe("parse timestamps and levels", () => {
    it("should extract ISO 8601 timestamps and brackets service", () => {
      const raw =
        "2024-03-15T10:30:00Z [DatabaseService] ERROR Connection timeout";
      const result = parser.parse(raw, raw);

      expect(result).not.toBeNull();
      expect(result?.rawTimestamp).toBe("2024-03-15T10:30:00Z");
      expect(result?.level).toBe("ERROR");
      expect(result?.service).toBe("DatabaseService");
      expect(result?.message).toBe(raw);
    });

    it("should extract Syslog timestamps and colon service", () => {
      const raw = "Oct 25 14:32:10 sshd: CRITICAL Failed password for root";
      const result = parser.parse(raw, raw);

      expect(result).not.toBeNull();
      expect(result?.rawTimestamp).toBe("Oct 25 14:32:10");
      expect(result?.level).toBe("FATAL"); // CRITICAL mapped to FATAL via Fallback level map
      expect(result?.service).toBe("sshd");
    });

    it("should extract 13-digit epoch timestamps", () => {
      const raw = "1700000000000 INFO App started successfully";
      const result = parser.parse(raw, raw);

      expect(result).not.toBeNull();
      expect(result?.rawTimestamp).toBe("1700000000000");
      expect(result?.time).toBe(1700000000000);
      expect(result?.level).toBe("INFO");
    });

    it("should extract 10-digit epoch timestamps", () => {
      const raw = "1700000000 WARN High memory usage";
      const result = parser.parse(raw, raw);

      expect(result).not.toBeNull();
      expect(result?.rawTimestamp).toBe("1700000000");
      expect(result?.time).toBe(1700000000000); // Should be multiplied to ms
      expect(result?.level).toBe("WARN");
    });

    it("should default to INFO if no level is found", () => {
      const raw = "2024-03-15 10:30:00 [Auth] User logged in";
      const result = parser.parse(raw, raw);

      expect(result).not.toBeNull();
      expect(result?.level).toBe("INFO");
    });

    it("should return null if absolutely no timestamp can be found", () => {
      const raw =
        "Just a random crash string without a valid time format ERROR";
      const result = parser.parse(raw, raw);

      expect(result).toBeNull();
    });
  });
});
