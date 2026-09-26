import { describe, expect, it } from "vitest";
import { isMonth, monthRange, previousMonth, toCsv } from "@/server/statements";
import { nextOccurrence } from "@/server/automation";
import { isReferralCode } from "@/server/rewards";
import { formatMoney, formatUsd } from "@/lib/utils";

describe("CSV export", () => {
  it("quotes separators and neutralises spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", 'say "hi", ok'], ["-1+1", 5]]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"say ""hi"", ok"`);
    expect(csv).toContain("'-1+1,5");
    // Numbers (including negatives) are data, not formulas.
    expect(toCsv(["n"], [[-5]])).toBe("n\r\n-5\r\n");
  });
});

describe("statement months", () => {
  it("validates and ranges months in UTC", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("../etc")).toBe(false);
    const { start, end } = monthRange("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(previousMonth(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
  });
});

describe("recurring schedule", () => {
  it("advances daily, weekly and monthly in UTC", () => {
    const from = new Date("2026-01-31T09:00:00Z");
    expect(nextOccurrence(from, "DAILY").toISOString()).toBe("2026-02-01T09:00:00.000Z");
    expect(nextOccurrence(from, "WEEKLY").toISOString()).toBe("2026-02-07T09:00:00.000Z");
    // Jan 31 + 1 month rolls into early March (JS Date semantics); still strictly later.
    expect(nextOccurrence(from, "MONTHLY").getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("referral codes", () => {
  it("accepts only the 8-char unambiguous alphabet", () => {
    expect(isReferralCode("ZGLN4ALN")).toBe(true);
    expect(isReferralCode("zgln4aln")).toBe(false);
    expect(isReferralCode("ABCD1234")).toBe(false); // 1 is excluded (looks like I)
    expect(isReferralCode("ABC")).toBe(false);
  });
});

describe("formatting", () => {
  it("formats money with 2 decimals and prices by magnitude", () => {
    expect(formatMoney(20)).toBe("$20.00");
    expect(formatMoney(1250.5)).toBe("$1,250.50");
    expect(formatUsd(64213.5)).toBe("$64,213.50");
  });
});
