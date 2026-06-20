import { describe, it, expect, beforeEach } from "vitest";
import { ThunderbirdParser } from "./index";

describe("ThunderbirdParser", () => {
  let parser: ThunderbirdParser;

  beforeEach(() => {
    parser = new ThunderbirdParser();
  });

  const rawNormal =
    "- 1131568288 2005.11.09 dn093 Nov  9 12:31:28 dn093 kernel: bcm5700: eth0: Link is down";
  const rawError =
    "- 1131568289 2005.11.09 dn094 Nov  9 12:31:29 dn094 logger: failed to start database";

  describe("parse", () => {
    it("should correctly extract epoch and format the node service", () => {
      const result = parser.parse(rawNormal, rawNormal);
      expect(result).not.toBeNull();
      expect(result?.time).toBe(1131568288 * 1000);
      expect(result?.service).toBe("Thunderbird/dn093/kernel");
      expect(result?.message).toBe("bcm5700: eth0: Link is down");
    });

    it("should set ERROR level if message contains 'failed'", () => {
      const result = parser.parse(rawError, rawError);
      expect(result?.level).toBe("ERROR");
      expect(result?.message).toBe("failed to start database");
    });
  });
});
