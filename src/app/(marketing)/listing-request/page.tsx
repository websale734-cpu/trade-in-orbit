import type { Metadata } from "next";
import { Container } from "@/components/ui/section";
import { ListingForm } from "./listing-form";

export const metadata: Metadata = { title: "Request a listing", description: "Ask Orbtrade to list your project's coin." };

export default function ListingRequestPage() {
  return (
    <Container className="max-w-2xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Request a coin listing</h1>
      <p className="mt-4 text-muted">
        Tell us about your project. Every request is reviewed for security, liquidity and legal fit. Submitting a
        request doesn&apos;t guarantee a listing, and we never charge a fee to consider one.
      </p>
      <div className="glass mt-10 rounded-[var(--radius-card)] p-5 sm:p-8">
        <ListingForm />
      </div>
    </Container>
  );
}
