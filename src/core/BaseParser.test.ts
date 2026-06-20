import { describe, it, expect } from "vitest";
import { BaseParser } from "./BaseParser";
import { LogEntry } from "../models/LogEntry";

// Create a concrete implementation to test abstract/protected features
class TestParser extends BaseParser {
  protected regex = /^\[(.*?)\] (.*)$/; // Simple mock regex: [LEVEL] message

  public parse(line: string, raw: string): LogEntry | null {
    const match = line.match(this.regex);
    if (!match) return null;
    return {
      time: Date.now(),
      rawTimestamp: "mock",
      level: this.detectLevel(match[1]),
      service: "Test",
      message: match[2],
      color: this.resolveColor(match[1]),
      raw,
    };
  }

  // Public wrappers to test protected methods
  public testDetectLevel(text?: string, fallbackMsg?: string) {
    return this.detectLevel(text, fallbackMsg);
  }

  public testResolveColor(level: string) {
    return this.resolveColor(level);
  }
}

describe("BaseParser", () => {
  const parser = new TestParser();

  describe("detectLevel (Explicit Tokens)", () => {
    it("should detect standard severity levels from text", () => {
      expect(parser.testDetectLevel("INFO")).toBe("INFO");
      expect(parser.testDetectLevel("ERROR")).toBe("ERROR");
      expect(parser.testDetectLevel("WARN")).toBe("WARN");
      expect(parser.testDetectLevel("DEBUG")).toBe("DEBUG");
    });

    it("should normalize varied critical levels to FATAL", () => {
      expect(parser.testDetectLevel("CRITICAL")).toBe("FATAL");
      expect(parser.testDetectLevel("EMERG")).toBe("FATAL");
      expect(parser.testDetectLevel("ALERT")).toBe("FATAL");
    });

    it("should return the exact uppercase string for unknown explicit levels", () => {
      expect(parser.testDetectLevel("CUSTOM_TAG")).toBe("CUSTOM_TAG");
      expect(parser.testDetectLevel(" system ")).toBe("SYSTEM");
    });
  });

  describe("detectLevel (Message Fallback Scanning)", () => {
    it("should detect ERROR from critical keywords in fallback message", () => {
      expect(
        parser.testDetectLevel(undefined, "NullPointerException EXCEPTION"),
      ).toBe("ERROR");
      expect(
        parser.testDetectLevel(undefined, "CRITICAL FAILURE in database"),
      ).toBe("ERROR");
      expect(
        parser.testDetectLevel(undefined, "The system FAILED to boot"),
      ).toBe("ERROR");
    });

    it("should default to INFO when no error keywords are found", () => {
      expect(
        parser.testDetectLevel(undefined, "User successfully logged in"),
      ).toBe("INFO");
      expect(parser.testDetectLevel(undefined, "Application starting up")).toBe(
        "INFO",
      );
    });
  });

  describe("resolveColor", () => {
    it("should resolve standard mapped colors", () => {
      expect(parser.testResolveColor("ERROR")).toBe("#ef4444"); // Mapped red
    });

    it("should fallback to HSL hashing for unknown levels", () => {
      expect(parser.testResolveColor("CUSTOM_LEVEL")).toMatch(/^hsl\(/);
    });
  });

  describe("canParse", () => {
    it("should return true if the internal regex matches", () => {
      expect(parser.canParse("[INFO] Server started")).toBe(true);
    });

    it("should return false if the internal regex fails", () => {
      expect(parser.canParse("Invalid log format without brackets")).toBe(
        false,
      );
    });
  });
});
