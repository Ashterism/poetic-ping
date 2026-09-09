import { describe, expect, it } from "vitest";
import { assertTimezone, slug, validDate, validTime } from "../src/validation";

describe("input validation", () => {
  it("accepts IANA timezones and rejects invented zones", () => {
    expect(() => assertTimezone("Europe/London")).not.toThrow();
    expect(() => assertTimezone("Moon/SeaOfTranquility")).toThrow();
  });

  it("normalises tag names", () => {
    expect(slug("  Love & Friendship  ")).toBe("love-friendship");
  });

  it("recognises delivery dates and times", () => {
    expect(validDate("2026-09-09")).toBe(true);
    expect(validDate("2026-22-99")).toBe(false);
    expect(validTime("08:30")).toBe(true);
    expect(validTime("25:00")).toBe(false);
  });
});
