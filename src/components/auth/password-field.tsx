"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClasses } from "@/components/ui/form";
import { passwordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

const barColours = ["bg-down", "bg-down", "bg-warn", "bg-accent-cyan", "bg-up"];

/** Password input with show/hide toggle and an optional live strength meter. */
export function PasswordField({
  label,
  name = "password",
  error,
  hint,
  meter = false,
  autoComplete = "current-password",
}: {
  label: string;
  name?: string;
  error?: string;
  hint?: string;
  meter?: boolean;
  autoComplete?: string;
}) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${name}-help`}
          className={cn(inputClasses, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {meter && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    barColours[strength.score],
                    value && i < Math.max(1, strength.score) ? "w-full" : "w-0",
                  )}
                />
              </div>
            ))}
          </div>
          {value && <p className="mt-1 text-xs text-muted">Strength: {strength.label}</p>}
        </div>
      )}

      <p id={`${name}-help`} className={cn("mt-1.5 text-xs", error ? "text-sm text-down" : "text-muted")}>
        {error ?? hint}
      </p>
    </div>
  );
}
