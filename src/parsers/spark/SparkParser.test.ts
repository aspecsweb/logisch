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
  });
});
