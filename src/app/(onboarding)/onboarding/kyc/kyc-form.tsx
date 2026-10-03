"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, FileCheck2, Upload } from "lucide-react";
import { FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { KYC_MAX_FILE_BYTES, KYC_MAX_IMAGE_EDGE, KYC_MAX_TOTAL_BYTES } from "@/lib/kyc-limits";
import { cn } from "@/lib/utils";
import { submitKyc } from "../actions";

export function KycForm({ countries }: { countries: { code: string; name: string }[] }) {
  const { dict } = useI18n();
  const k = dict.auth.kyc;
  const [state, action] = useActionState(submitKyc, undefined);
  const [docType, setDocType] = useState(state?.values?.documentType || "PASSPORT");
  const [preparing, setPreparing] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const fe = state?.fieldErrors ?? {};
  const onPreparing = (delta: number) => setPreparing((n) => n + delta);

  // All files go up in one request, which the host rejects above 4.5 MB without
  // any response the form can show, so stop oversized submissions here.
  function checkBeforeSend(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null);
    if (preparing > 0) {
      e.preventDefault();
      setClientError(k.stillPreparing);
      return;
    }
    let total = 0;
    for (const el of Array.from(e.currentTarget.elements)) {
      if (el instanceof HTMLInputElement && el.type === "file") total += el.files?.[0]?.size ?? 0;
    }
    if (total > KYC_MAX_TOTAL_BYTES) {
      e.preventDefault();
      setClientError(fmt(k.tooLargeTotal, { size: (total / (1024 * 1024)).toFixed(1) }));
    }
  }

  return (
    <form action={action} onSubmit={checkBeforeSend} className="space-y-5" noValidate>
      <FormMessage state={clientError ? { error: clientError } : state} />

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
        onPreparing={onPreparing}
      />
      {docType !== "PASSPORT" && (
        <FileDrop
          name="back"
          label={k.back}
          error={fe.back}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onPreparing={onPreparing}
        />
      )}
      <FileDrop
        name="selfie"
        label={k.selfie}
        note={k.selfieNote}
        error={fe.selfie}
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        onPreparing={onPreparing}
      />

      <SubmitButton disabled={preparing > 0}>{k.submit}</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/dashboard" className="text-muted hover:text-fg">
          {k.later}
        </Link>
      </p>
    </form>
  );
}

/**
 * Scale a photo down so its longest side is at most KYC_MAX_IMAGE_EDGE and
 * re-encode it as JPEG. Phone photos shrink from several MB to a few hundred KB,
 * which is still plenty for a document review. PDFs, and anything the browser
 * can't decode, are returned unchanged; the server re-validates every file.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, KYC_MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Put `file` in the input so the form submits it instead of the original. */
function replaceFile(input: HTMLInputElement, file: File): void {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch {
    // Very old browsers can't set files; the original is sent and the size checks still apply.
  }
}

/**
 * Tappable upload tile. On phones `capture="user"` opens the front camera for
 * the selfie. Photos are shrunk as soon as they're picked; size is checked
 * client-side for fast feedback, and the server re-validates size and file type.
 */
function FileDrop({
  name,
  label,
  note,
  error,
  accept,
  capture,
  onPreparing,
}: {
  name: string;
  label: string;
  note?: string;
  error?: string;
  accept: string;
  capture?: "user";
  onPreparing: (delta: number) => void;
}) {
  const { dict } = useI18n();
  const k = dict.auth.kyc;
  const [file, setFile] = useState<{ name: string; size: number; preparing: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ignore a slow shrink that finishes after the user has already picked another file.
  const pickRef = useRef(0);
  const tooBig = !!file && !file.preparing && file.size > KYC_MAX_FILE_BYTES;
  // A server error describes the previous file; hide it once a new one is picked.
  const shownError = tooBig ? "File is larger than 5 MB." : file ? undefined : error;

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
          <span className="block text-xs text-muted">{file?.preparing ? k.preparing : (note ?? k.fileHint)}</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={accept}
          capture={capture}
          className="sr-only"
          onChange={async (e) => {
            const input = e.currentTarget;
            const picked = input.files?.[0];
            const pick = ++pickRef.current;
            if (!picked) return setFile(null);
            setFile({ name: picked.name, size: picked.size, preparing: true });
            onPreparing(1);
            try {
              const ready = await shrinkImage(picked);
              if (pick !== pickRef.current) return;
              if (ready !== picked) replaceFile(input, ready);
              setFile({ name: picked.name, size: input.files?.[0]?.size ?? picked.size, preparing: false });
            } finally {
              onPreparing(-1);
            }
          }}
        />
      </label>
      {shownError && <p className="mt-1.5 text-sm text-down">{shownError}</p>}
    </div>
  );
}
