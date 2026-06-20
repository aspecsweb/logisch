import { describe, it, expect } from "vitest";
import { getLevelColor, getLevelLabel } from "./LevelColors";

describe("LevelColors", () => {
  describe("getLevelColor", () => {
    it("should return exact mapped hex colors for standard levels", () => {
      expect(getLevelColor("INFO")).toBe("#3b82f6");
      expect(getLevelColor("ERROR")).toBe("#ef4444");
      expect(getLevelColor("WARN")).toBe("#f97316");
    });

    it("should return exact mapped hex colors for Android short codes", () => {
      expect(getLevelColor("V")).toBe("#94a3b8");
      expect(getLevelColor("D")).toBe("#0ea5e9");
    });

    it("should handle mixed casing and whitespace", () => {
      expect(getLevelColor(" info ")).toBe("#3b82f6");
      expect(getLevelColor("Error")).toBe("#ef4444");
    });

    it("should generate a fallback HSL color for unknown levels", () => {
      const color = getLevelColor("CUSTOM_FATAL");
      expect(color).toMatch(/^hsl\(\d+,\s*65%,\s*55%\)$/);
    });
  });

  describe("getLevelLabel", () => {
    it("should expand Android short codes to full words", () => {
      expect(getLevelLabel("V")).toBe("Verbose");
      expect(getLevelLabel("I")).toBe("Info");
      expect(getLevelLabel("E")).toBe("Error");
    });

    it("should return the original level string if it is not a short code", () => {
      expect(getLevelLabel("INFO")).toBe("INFO");
      expect(getLevelLabel("CRITICAL")).toBe("CRITICAL");
    });

    it("should normalize casing and trim whitespace", () => {
      expect(getLevelLabel(" e ")).toBe("Error");
      expect(getLevelLabel("debug")).toBe("DEBUG"); // Assuming it just uppercases non-short codes
    });
  });
});
