"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Six single-digit boxes that behave like one field: typing advances, backspace
 * goes back, and pasting a full code fills every box. The combined value is
 * submitted as a hidden input named `name`. Uses `autocomplete="one-time-code"`
 * so iOS and Android can offer the SMS code from the keyboard.
 */
export function OtpInput({
  name = "code",
  label,
  autoFocus = true,
  invalid,
  onComplete,
}: {
  name?: string;
  label: string;
  autoFocus?: boolean;
  invalid?: boolean;
  /** Called when all six digits are filled (e.g. to auto-submit the form). */
  onComplete?: (code: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join("");

  // Fire onComplete after React has committed the new value to the hidden
  // input. Calling it synchronously inside onChange would submit the form with
  // the previous (5-digit) value.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });
  useEffect(() => {
    if (code.length === 6) onCompleteRef.current?.(code);
  }, [code]);

  // React resets the form after every action. Clear the boxes too, so a wrong
  // code can be retyped straight away.
  useEffect(() => {
    const form = refs.current[0]?.form;
    if (!form) return;
    const onReset = () => {
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function update(next: string[]) {
    setDigits(next);
  }

  function fill(from: number, text: string) {
    const clean = text
      .replace(/\D/g, "")
      .slice(0, 6 - from)
      .split("");
    if (clean.length === 0) return;
    const next = [...digits];
    clean.forEach((d, i) => (next[from + i] = d));
    update(next);
    refs.current[Math.min(5, from + clean.length)]?.focus();
  }

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium">{label}</legend>
      <input type="hidden" name={name} value={digits.join("")} />
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && i === 0}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={invalid}
            maxLength={i === 0 ? 6 : 1}
            className={cn(
              "tabular h-14 w-full min-w-0 rounded-xl border border-line-strong bg-surface text-center text-2xl font-semibold transition-all outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:h-16",
              invalid && "border-down",
            )}
            onChange={(e) => {
              const v = e.target.value;
              if (v.length > 1) return fill(i, v); // paste or SMS autofill into one box
              const next = [...digits];
              next[i] = v.replace(/\D/g, "");
              update(next);
              if (next[i] && i < 5) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
              if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
            }}
            onPaste={(e) => {
              e.preventDefault();
              fill(i, e.clipboardData.getData("text"));
            }}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
    </fieldset>
  );
}
