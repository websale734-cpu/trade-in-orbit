import "server-only";
import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Argon2id password hashing (OWASP-recommended parameters: 19 MiB, 2 passes).
 *
 * Uses hash-wasm (WebAssembly), so there's no native binary to build or to
 * match against the host's C runtime. The encoded hash stores its own
 * parameters and salt, so they can be raised later without breaking existing hashes.
 */
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19_456, hashLength: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2id({ ...PARAMS, password, salt: randomBytes(16), outputType: "encoded" });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: passwordHash });
  } catch {
    return false;
  }
}

// A real hash of a random value, verified when the email isn't registered so
// "unknown email" and "wrong password" take the same time (no user enumeration
// via response timing).
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(await dummyHash, password);
}
