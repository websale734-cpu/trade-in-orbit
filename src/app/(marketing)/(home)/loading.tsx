import { OrbLoader } from "@/components/brand/orb-loader";

/**
 * Branded loading state for the landing page while market data loads.
 * Deliberately scoped to this route group: a loading.tsx starts streaming, which
 * locks the HTTP status at 200, so it must not wrap routes that can 404.
 */
export default function Loading() {
  return (
    <div className="grid flex-1 place-items-center py-32">
      <OrbLoader />
    </div>
  );
}
