import { describe, it, expect, beforeEach } from "vitest";
import { SparkParser } from "./index";

describe("SparkParser", () => {
  let parser: SparkParser;

  beforeEach(() => {
    parser = new SparkParser();
  });

  const rawLog =
    "17/06/09 20:10:41 INFO executor.CoarseGrainedExecutorBackend: Got assigned task 1";

  describe("parse", () => {
    it("should extract YY/MM/DD and Spark services", () => {
      const result = parser.parse(rawLog, rawLog);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("INFO");
      expect(result?.service).toBe("executor.CoarseGrainedExecutorBackend");
      expect(result?.message).toBe("Got assigned task 1");

      const expectedTime = new Date(2017, 5, 9, 20, 10, 41).getTime(); // 5 = June
      expect(result?.time).toBe(expectedTime);
    });

    it("should return null for lines that don't match the Spark log shape", () => {
      expect(parser.parse("not a spark line", "not a spark line")).toBeNull();
    });

    it("should resolve the mapped theme color for a recognized level, not a hashed fallback", () => {
      const rawError =
        "17/06/09 20:10:41 ERROR executor.Executor: Exception in task 0.0";
      const result = parser.parse(rawError, rawError);

      expect(result?.level).toBe("ERROR");
      // Must come from LEVEL_COLOR_MAP via resolveColor(), not a per-string HSL hash
      expect(result?.color).toBe("#ef4444");
    });
  });
});
