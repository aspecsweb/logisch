import { describe, it, expect, beforeEach } from "vitest";
import { ProxifierParser } from "./index";

describe("ProxifierParser", () => {
  let parser: ProxifierParser;

  beforeEach(() => {
    parser = new ProxifierParser();
  });

  const rawLog = "[10.25 14:32:10] chrome.exe - proxy.example.com:8080 open";

  describe("parse", () => {
    it("should extract Proxifier timestamp formats and services", () => {
      const result = parser.parse(rawLog, rawLog);
      expect(result).not.toBeNull();
      expect(result?.service).toBe("chrome.exe");
      expect(result?.message).toBe("proxy.example.com:8080 open");
      expect(result?.rawTimestamp).toBe("10.25 14:32:10");

      // Verify date math
      const expectedYear = new Date().getFullYear();
      const expectedTime = new Date(expectedYear, 9, 25, 14, 32, 10).getTime(); // Month is 0-indexed (9 = Oct)
      expect(result?.time).toBe(expectedTime);
    });
  });
});
