import { LogoMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-32 text-center">
      <div>
        <LogoMark className="mx-auto h-14 w-14 animate-float" />
        <p className="text-brand mt-6 text-sm font-semibold tracking-widest uppercase">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Lost in orbit</h1>
        <p className="mt-3 text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <ButtonLink href="/" className="mt-8">
          Back to home
        </ButtonLink>
      </div>
    </main>
  );
}
