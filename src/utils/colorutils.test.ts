import { describe, it, expect } from "vitest";
import { stringToHslColor } from "./ColorUtils";

describe("ColorUtils - stringToHslColor", () => {
  it("should generate a valid HSL string format", () => {
    const color = stringToHslColor("TestService");
    expect(color).toMatch(/^hsl\(\d+,\s*65%,\s*50%\)$/);
  });

  it("should return consistent, deterministic colors for the same string", () => {
    const color1 = stringToHslColor("DatabaseWorker");
    const color2 = stringToHslColor("DatabaseWorker");
    expect(color1).toBe(color2);
  });

  it("should return different colors for different strings", () => {
    const color1 = stringToHslColor("Nginx");
    const color2 = stringToHslColor("Apache");
    expect(color1).not.toBe(color2);
  });

  it("should handle empty strings safely", () => {
    const color = stringToHslColor("");
    expect(color).toBe("hsl(0, 65%, 50%)");
  });
});
