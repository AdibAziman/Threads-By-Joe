import { describe, expect, it } from "vitest";
import { isQuietHours, isValidTimezone, localParts, upcomingSlots, zonedToUtc } from "../lib/time";

describe("time", () => {
  it("quiet hours wrap past midnight", () => {
    const tz = "UTC";
    expect(isQuietHours(new Date("2026-01-01T23:30:00Z"), tz, "23:00", "07:00")).toBe(true);
    expect(isQuietHours(new Date("2026-01-01T03:00:00Z"), tz, "23:00", "07:00")).toBe(true);
    expect(isQuietHours(new Date("2026-01-01T12:00:00Z"), tz, "23:00", "07:00")).toBe(false);
    expect(isQuietHours(new Date("2026-01-01T07:00:00Z"), tz, "23:00", "07:00")).toBe(false);
  });
  it("quiet hours use the account time zone", () => {
    // 15:00 UTC is 23:00 in Singapore (UTC+8)
    expect(isQuietHours(new Date("2026-01-01T15:00:00Z"), "Asia/Singapore", "23:00", "07:00")).toBe(true);
    expect(isQuietHours(new Date("2026-01-01T15:00:00Z"), "UTC", "23:00", "07:00")).toBe(false);
  });
  it("converts wall-clock times to UTC across DST", () => {
    expect(zonedToUtc({ y: 2026, m: 1, d: 15, h: 9, min: 0 }, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedToUtc({ y: 2026, m: 7, d: 15, h: 9, min: 0 }, "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });
  it("builds ascending future slots", () => {
    const now = new Date("2026-03-10T10:00:00Z");
    const slots = upcomingSlots(now, "UTC", ["09:00", "18:00"], 2);
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-03-10T18:00:00.000Z", "2026-03-11T09:00:00.000Z", "2026-03-11T18:00:00.000Z"]);
  });
  it("validates time zones", () => {
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Mars/Base")).toBe(false);
    expect(localParts(new Date("2026-01-01T00:00:00Z"), "UTC").h).toBe(0);
  });
});
