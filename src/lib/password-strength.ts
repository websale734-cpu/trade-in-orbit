/**
 * Password strength estimate shared by the client meter and server validation.
 *
 * Deliberately simple and dependency-free (zxcvbn adds ~800 KB). Server-side
 * rules are the source of truth; the meter only guides the user.
 */
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "123456789012",
  "qwertyuiop12",
  "letmein12345",
  "iloveyou1234",
  "welcome12345",
  "admin1234567",
  "orbtrade1234",
  "bitcoin12345",
  "crypto123456",
  "changeme1234",
  "abcdefghijkl",
  "trustno11234",
]);

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong" };

export function passwordStrength(pw: string): Strength {
  if (pw.length < 8 || COMMON.has(pw.toLowerCase())) return { score: 0, label: "Too weak" };
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/\d/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  const unique = new Set(pw).size;

  let score = 0;
  if (pw.length >= PASSWORD_MIN) score++;
  if (pw.length >= 16) score++;
  if (classes >= 3) score++;
  if (classes === 4 || pw.length >= 20) score++;
  if (unique < 6) score = Math.min(score, 1);

  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
  const s = Math.min(4, score) as Strength["score"];
  return { score: s, label: labels[s] };
}

/** Server-side policy. Returns an error message, or null when acceptable. */
export function passwordPolicyError(pw: string, email?: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (COMMON.has(pw.toLowerCase())) return "This password is too common. Choose something less predictable.";
  if (new Set(pw).size < 6) return "Use a greater variety of characters.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local))
    return "Your password shouldn't contain your email address.";
  return null;
}
