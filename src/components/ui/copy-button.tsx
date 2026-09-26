"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClasses } from "./button";

/** Copies `value` to the clipboard and confirms inline. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClasses({ variant: "secondary", size: "md" })}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the value is visible and selectable */
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-up" /> : <Copy className="h-4 w-4" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
