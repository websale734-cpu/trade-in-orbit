"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, FileCheck2, Upload } from "lucide-react";
import { FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { submitKyc } from "../actions";

const MAX_BYTES = 5 * 1024 * 1024;

export function KycForm({ countries }: { countries: { code: string; name: string }[] }) {
  const { dict } = useI18n();
  const k = dict.auth.kyc;
  const [state, action] = useActionState(submitKyc, undefined);
  const [docType, setDocType] = useState(state?.values?.documentType || "PASSPORT");
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />

      <div>
        <label htmlFor="documentType" className="mb-1.5 block text-sm font-medium">
          {k.docType}
        </label>
        <select
          id="documentType"
          name="documentType"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className={inputClasses}
        >
          {(Object.keys(k.docTypes) as Array<keyof typeof k.docTypes>).map((t) => (
            <option key={t} value={t}>
              {k.docTypes[t]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="documentCountry" className="mb-1.5 block text-sm font-medium">
          {k.country}
        </label>
        <select
          id="documentCountry"
          name="documentCountry"
          defaultValue={state?.values?.documentCountry ?? ""}
          aria-invalid={!!fe.documentCountry}
          className={inputClasses}
          required
        >
          <option value="" disabled>
            —
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {fe.documentCountry && <p className="mt-1.5 text-sm text-down">{fe.documentCountry}</p>}
      </div>

      <FileDrop
        name="front"
        label={k.front}
        error={fe.front}
        accept="image/jpeg,image/png,image/webp,application/pdf"
      />
      {docType !== "PASSPORT" && (
        <FileDrop name="back" label={k.back} error={fe.back} accept="image/jpeg,image/png,image/webp,application/pdf" />
      )}
      <FileDrop
        name="selfie"
        label={k.selfie}
        note={k.selfieNote}
        error={fe.selfie}
        accept="image/jpeg,image/png,image/webp"
        capture="user"
      />

      <SubmitButton>{k.submit}</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/dashboard" className="text-muted hover:text-fg">
          {k.later}
        </Link>
      </p>
    </form>
  );
}

/**
 * Tappable upload tile. On phones `capture="user"` opens the front camera for
 * the selfie. Size is checked client-side for fast feedback; the server
 * re-validates size and file type.
 */
function FileDrop({
  name,
  label,
  note,
  error,
  accept,
  capture,
}: {
  name: string;
  label: string;
  note?: string;
  error?: string;
  accept: string;
  capture?: "user";
}) {
  const { dict } = useI18n();
  const k = dict.auth.kyc;
  const [file, setFile] = useState<{ name: string; tooBig: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // A server error describes the previous file; hide it once a new one is picked.
  const shownError = file?.tooBig ? "File is larger than 5 MB." : file ? undefined : error;

  // React resets the form after each submit, which empties file inputs; clear the tile to match.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setFile(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  const Icon = capture ? Camera : Upload;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface p-4 transition-colors hover:border-accent",
          shownError && "border-down",
          file && !shownError && "border-solid border-up/50",
        )}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-strong">
          {file && !shownError ? <FileCheck2 className="h-5 w-5 text-up" /> : <Icon className="h-5 w-5 text-accent" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-medium">{file ? file.name : capture ? k.takePhoto : k.choose}</span>
          <span className="block text-xs text-muted">{note ?? k.fileHint}</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={accept}
          capture={capture}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFile(f ? { name: f.name, tooBig: f.size > MAX_BYTES } : null);
          }}
        />
      </label>
      {shownError && <p className="mt-1.5 text-sm text-down">{shownError}</p>}
    </div>
  );
}
