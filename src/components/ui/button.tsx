import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[0_8px_30px_-8px_var(--glow-violet)] hover:shadow-[0_10px_40px_-6px_var(--glow-violet)] hover:brightness-110",
  secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-strong",
  ghost: "text-muted hover:text-fg hover:bg-surface",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-8 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
