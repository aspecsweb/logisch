import { describe, it, expect, beforeEach } from "vitest";
import { MacOSXParser } from "./index";

describe("MacOSXParser", () => {
  let parser: MacOSXParser;

  beforeEach(() => {
    parser = new MacOSXParser();
  });

  const rawWarn =
    "Jul  1 09:00:00 authorMacBook configd[123]: network unplugged";
  const rawError =
    "Jul  1 09:05:00 calvisitor symp[456]: exited abnormally with code 1";
  const rawApple =
    "Jul  1 09:10:00 someMac com.apple.mDNSResponder[789]: responding to query";

  describe("canParse & parsing filter", () => {
    it("should return true for matching hosts (authorMacBook, calvisitor, etc)", () => {
      expect(parser.canParse(rawWarn)).toBe(true);
      expect(parser.canParse(rawError)).toBe(true);
    });

    it("should accept com.apple strings even if canParse is false", () => {
      const result = parser.parse(rawApple, rawApple);
      expect(result).not.toBeNull();
      expect(result?.service).toBe("someMac/com.apple.mDNSResponder[789]");
    });
  });

  describe("parse level deduction", () => {
    it("should correctly deduce WARN from 'unplug'", () => {
      const result = parser.parse(rawWarn, rawWarn);
      expect(result?.level).toBe("WARN");
      expect(result?.message).toBe("network unplugged");
    });

    it("should correctly deduce ERROR from 'exited abnormally'", () => {
      const result = parser.parse(rawError, rawError);
      expect(result?.level).toBe("ERROR");
    });
  });
});
