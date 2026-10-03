"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { submitReview } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

/** "Share your experience": real customers submit reviews, which staff approve before they're public. */
export function ReviewCard({ existing }: { existing: "PENDING" | "APPROVED" | null }) {
  const [state, action] = useActionState(submitReview, undefined);
  const [rating, setRating] = useState(5);
  if (existing || state?.message)
    return (
      <section className="glass rounded-[var(--radius-card)] p-5 text-sm text-muted">
        {state?.message ??
          (existing === "APPROVED"
            ? "Thanks, your review is live on our homepage."
            : "Thanks, your review is waiting for approval.")}
      </section>
    );
  return (
    <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Share your experience">
      <form action={action} className="space-y-3">
        <h2 className="font-semibold">Enjoying Trade In Orbit?</h2>
        <FormMessage state={state} />
        <input type="hidden" name="rating" value={rating} />
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} stars`}
              onClick={() => setRating(n)}
            >
              <Star className={cn("h-6 w-6", n <= rating ? "fill-warn text-warn" : "text-line-strong")} />
            </button>
          ))}
        </div>
        <textarea
          name="body"
          rows={3}
          maxLength={600}
          placeholder="Tell other customers about your experience"
          className="w-full rounded-xl border border-line-strong bg-surface p-3 text-sm outline-none focus:border-accent"
        />
        <SubmitButton variant="secondary" className="sm:w-auto">
          Submit review
        </SubmitButton>
        <p className="text-xs text-subtle">Shown with your first name and last initial after review.</p>
      </form>
    </section>
  );
}
