import { describe, it, expect, beforeEach } from "vitest";
import { JsonParser } from "./index";
import { getLevelColor } from "../../utils/LevelColors";

describe("JsonParser", () => {
  let parser: JsonParser;

  beforeEach(() => {
    parser = new JsonParser();
  });

  const pinoLine =
    '{"level":30,"time":1704067200000,"pid":4242,"hostname":"web-1","msg":"server listening"}';
  const winstonLine =
    '{"timestamp":"2024-01-01T00:00:00.000Z","level":"error","message":"db connection failed","service":"api"}';

  describe("canParse", () => {
    it("should return true for JSON object lines", () => {
      expect(parser.canParse(pinoLine)).toBe(true);
      expect(parser.canParse(winstonLine)).toBe(true);
      expect(parser.canParse('  {"a":1}  ')).toBe(true);
    });

    it("should return false for non-JSON-object lines", () => {
      expect(parser.canParse("Just a standard log string")).toBe(false);
      expect(parser.canParse("[1,2,3]")).toBe(false);
      expect(parser.canParse("2005-12-04 04:47:44 notice ready")).toBe(false);
    });
  });

  describe("parse", () => {
    it("should parse a pino-style line with numeric level and epoch ms", () => {
      const result = parser.parse(pinoLine, pinoLine);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("INFO");
      expect(result?.time).toBe(1704067200000);
      expect(result?.rawTimestamp).toBe("1704067200000");
      expect(result?.message).toBe("server listening");
      expect(result?.pid).toBe("4242");
      expect(result?.color).toBe(getLevelColor("INFO"));
    });

    it("should parse a winston-style line with ISO timestamp and text level", () => {
      const result = parser.parse(winstonLine, winstonLine);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("ERROR");
      expect(result?.rawTimestamp).toBe("2024-01-01T00:00:00.000Z");
      expect(result?.time).toBe(Date.parse("2024-01-01T00:00:00.000Z"));
      expect(result?.service).toBe("api");
      expect(result?.message).toBe("db connection failed");
    });

    it("should treat 10-digit numeric timestamps as epoch seconds", () => {
      const line = '{"ts":1704067200,"lvl":"warn","msg":"slow response"}';
      const result = parser.parse(line, line);
      expect(result?.time).toBe(1704067200000);
      expect(result?.level).toBe("WARN");
    });

    it("should map string-encoded numeric severities", () => {
      const line = '{"severity":"50","message":"boom"}';
      const result = parser.parse(line, line);
      expect(result?.level).toBe("ERROR");
    });

    it("should resolve service from alias keys", () => {
      const line = '{"level":"info","logger":"auth.session","msg":"ok"}';
      const result = parser.parse(line, line);
      expect(result?.service).toBe("auth.session");
    });

    it("should surface compact JSON when no message field exists", () => {
      const line = '{"level":"info","foo":"bar"}';
      const result = parser.parse(line, line);
      expect(result?.message).toBe('{"level":"info","foo":"bar"}');
    });

    it("should default missing timestamp to now and level to INFO", () => {
      const before = Date.now();
      const line = '{"msg":"no meta here"}';
      const result = parser.parse(line, line);
      const after = Date.now();
      expect(result?.level).toBe("INFO");
      expect(result?.rawTimestamp).toBe("");
      expect(result?.time).toBeGreaterThanOrEqual(before);
      expect(result?.time).toBeLessThanOrEqual(after);
    });

    it("should return null for malformed JSON", () => {
      const line = '{"level":"info", "msg": }';
      expect(parser.parse(line, line)).toBeNull();
    });

    it("should return null for JSON that is not an object", () => {
      expect(parser.parse("[1,2,3]", "[1,2,3]")).toBeNull();
    });

    it("should preserve the raw line", () => {
      const result = parser.parse(pinoLine, pinoLine);
      expect(result?.raw).toBe(pinoLine);
    });
  });
});
