import { describe, it, expect, beforeEach } from "vitest";
import { ZookeeperParser } from "./index";

describe("ZookeeperParser", () => {
  let parser: ZookeeperParser;

  beforeEach(() => {
    parser = new ZookeeperParser();
  });

  const rawLog =
    "2015-07-29 11:13:13,293 - INFO  [main:QuorumPeerConfig@103] - Reading configuration from: /etc/zookeeper/zoo.cfg";

  describe("parse", () => {
    it("should extract comma-separated milliseconds and standard ZK layout", () => {
      const result = parser.parse(rawLog, rawLog);
      expect(result).not.toBeNull();
      expect(result?.level).toBe("INFO");
      expect(result?.service).toBe("main:QuorumPeerConfig@103");
      expect(result?.message).toBe(
        "Reading configuration from: /etc/zookeeper/zoo.cfg",
      );

      const expectedTime = new Date(2015, 6, 29, 11, 13, 13, 293).getTime(); // 6 = July
      expect(result?.time).toBe(expectedTime);
    });

    it("should return null for lines that don't match the Zookeeper log shape", () => {
      expect(parser.parse("not a zookeeper line", "not a zookeeper line")).toBeNull();
    });

    it("should resolve the mapped theme color for a WARN level, not a hashed fallback", () => {
      const rawWarn =
        "2015-07-29 11:13:14,001 - WARN  [main:NIOServerCnxn@1] - Client disconnected";
      const result = parser.parse(rawWarn, rawWarn);

      expect(result?.level).toBe("WARN");
      // Must come from LEVEL_COLOR_MAP via resolveColor(), not a per-string HSL hash
      expect(result?.color).toBe("#f97316");
    });
  });
});
