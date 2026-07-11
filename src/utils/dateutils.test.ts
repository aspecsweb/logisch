import { describe, it, expect } from "vitest";
import { localDateTimeToEpoch } from "./DateUtils";

describe("DateUtils - localDateTimeToEpoch", () => {
  it("should convert 1-indexed month input to Date's 0-indexed month", () => {
    // If the -1 conversion were dropped, December (12) would roll into January
    // of the following year instead of staying in December.
    const result = localDateTimeToEpoch(2024, 12, 31, 23, 59, 59);
    expect(result).toBe(new Date(2024, 11, 31, 23, 59, 59).getTime());
    expect(result).not.toBe(new Date(2025, 0, 31, 23, 59, 59).getTime());
  });

  it("should default milliseconds to 0 when omitted", () => {
    const withoutMs = localDateTimeToEpoch(2024, 1, 1, 0, 0, 0);
    const explicitZeroMs = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
    expect(withoutMs).toBe(explicitZeroMs);
  });

  it("should honor an explicit milliseconds component", () => {
    // Mirrors Zookeeper's "HH:mm:ss,SSS" format
    const result = localDateTimeToEpoch(2015, 7, 29, 11, 13, 13, 293);
    expect(result).toBe(new Date(2015, 6, 29, 11, 13, 13, 293).getTime());
  });

  it("should let native Date resolve day-of-month overflow", () => {
    // Day 0 of a given month rolls back to the last day of the prior month,
    // matching JS Date's own overflow semantics rather than throwing.
    const result = localDateTimeToEpoch(2024, 3, 0, 0, 0, 0);
    expect(result).toBe(new Date(2024, 2, 0, 0, 0, 0).getTime());
    expect(new Date(result).getMonth()).toBe(1); // rolled back into February
  });
});
