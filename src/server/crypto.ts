import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

/**
 * Cryptographic helpers.
 *
 * - Tokens and one-time codes are stored as HMAC-SHA256 (keyed with
 *   SESSION_SECRET), so a database leak alone can't be used to log in or to
 *   brute-force 6-digit codes offline.
 * - Sensitive fields are encrypted with AES-256-GCM (DATA_ENCRYPTION_KEY).
 *   Layout: [12-byte IV][16-byte auth tag][ciphertext].
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  return Buffer.from(env().DATA_ENCRYPTION_KEY, "base64");
}

export function encryptBytes(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decryptBytes(blob: Buffer | Uint8Array): Buffer {
  const buf = Buffer.from(blob);
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

/** Encrypt a string for a text column (base64 output). */
export function encryptString(plain: string): string {
  return encryptBytes(Buffer.from(plain, "utf8")).toString("base64");
}

export function decryptString(enc: string): string {
  return decryptBytes(Buffer.from(enc, "base64")).toString("utf8");
}

/** Keyed hash for tokens and codes. `scope` prevents a hash from one context matching another. */
export function hmac(scope: string, value: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(`${scope}:${value}`).digest("base64url");
}

/** Constant-time comparison of two hashes. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** URL-safe random token (256 bits by default). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Uniformly random 6-digit numeric code, zero-padded. */
export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
