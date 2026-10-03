/**
 * Shared Tailwind class strings for admin forms.
 *
 * These live in a server-safe module (NO "use client") on purpose. They are
 * consumed by Server Components via `cn(adminButton, …)`. If they were exported
 * from a "use client" module, a Server Component would receive a client-reference
 * proxy instead of the string, and `cn()` would stringify that proxy into a
 * broken className. Keep them here so both server and client get the real string.
 */
export const adminInput =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent";
export const adminButton =
  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50";
