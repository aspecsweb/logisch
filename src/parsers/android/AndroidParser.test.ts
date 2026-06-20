import { describe, it, expect, beforeEach } from "vitest";
import { AndroidParser } from "./index"; // Assuming it's exported from index.ts

describe("AndroidParser", () => {
  let parser: AndroidParser;

  beforeEach(() => {
    parser = new AndroidParser();
  });

  describe("Format A (Short Date)", () => {
    const rawLine =
      "10-25 14:32:10.123  1000  2000 E MyService: Connection timed out";

    it("should return true for canParse", () => {
      expect(parser.canParse(rawLine)).toBe(true);
    });

    it("should successfully parse all fields", () => {
      const result = parser.parse(rawLine, rawLine);

      expect(result).not.toBeNull();
      expect(result?.level).toBe("E");
      expect(result?.pid).toBe("1000");
      expect(result?.tid).toBe("2000");
      expect(result?.service).toBe("MyService");
      expect(result?.message).toBe("Connection timed out");
      expect(result?.rawTimestamp).toBe("10-25 14:32:10.123");
      expect(result?.raw).toBe(rawLine);
    });
  });

  describe("Format B (ISO Date)", () => {
    const rawLine =
      "2024-10-25 14:32:10.123  1000-2000  MyTag  W  Low memory warning";

    it("should return true for canParse", () => {
      expect(parser.canParse(rawLine)).toBe(true);
    });

    it("should successfully parse all fields", () => {
      const result = parser.parse(rawLine, rawLine);

      expect(result).not.toBeNull();
      expect(result?.level).toBe("W");
      expect(result?.pid).toBe("1000");
      expect(result?.tid).toBe("2000");
      expect(result?.service).toBe("MyTag");
      expect(result?.message).toBe("Low memory warning");
      expect(result?.rawTimestamp).toBe("2024-10-25 14:32:10.123");
      expect(result?.raw).toBe(rawLine);
    });
  });

  describe("Invalid Logs", () => {
    it("should return false for canParse on invalid formats", () => {
      expect(parser.canParse("Just some random text without timestamps")).toBe(
        false,
      );
      expect(parser.canParse("[Apache] 200 GET /index.html")).toBe(false);
    });

    it("should return null when parsing invalid logs", () => {
      expect(parser.parse("Invalid log line", "Invalid log line")).toBeNull();
    });
  });
});
