import { describe, expect, it } from "vitest";
import { decryptString, encryptString, hmac, randomCode, safeEqual } from "@/server/crypto";
import { safeNext, maskEmail } from "@/server/auth/dal";
import { passwordPolicyError, passwordStrength } from "@/lib/password-strength";

describe("encryption at rest", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptString("GB29 NWBK 6016 1331 9268 19");
    const b = encryptString("GB29 NWBK 6016 1331 9268 19");
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe("GB29 NWBK 6016 1331 9268 19");
  });

  it("rejects tampered ciphertext (authenticated encryption)", () => {
    const enc = Buffer.from(encryptString("secret"), "base64");
    enc[enc.length - 1] ^= 1;
    expect(() => decryptString(enc.toString("base64"))).toThrow();
  });
});

describe("tokens and codes", () => {
  it("scopes HMACs so a hash from one context never matches another", () => {
    expect(hmac("session", "x")).not.toBe(hmac("api-key", "x"));
    expect(hmac("session", "x")).toBe(hmac("session", "x"));
  });
  it("compares in constant time and handles length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("generates 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
});

describe("redirect safety", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/trade?side=buy")).toBe("/trade?side=buy");
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
  it("masks emails", () => {
    expect(maskEmail("jordan@example.com")).toBe("jo****@example.com");
  });
});

describe("password policy", () => {
  it("enforces length, variety and no email", () => {
    expect(passwordPolicyError("short", "a@b.co")).toMatch(/at least/);
    expect(passwordPolicyError("aaaaaaaaaaaaaa", "a@b.co")).toBeTruthy();
    expect(passwordPolicyError("jordan-secret-phrase-9", "jordan@example.com")).toMatch(/email/);
    expect(passwordPolicyError("Correct-Horse-Battery-42", "x@example.com")).toBeNull();
  });
  it("scores longer mixed passwords higher", () => {
    expect(passwordStrength("Correct-Horse-Battery-Staple-42").score).toBeGreaterThan(passwordStrength("password12").score);
  });
});
