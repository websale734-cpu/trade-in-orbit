import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/** Page-width container with the 16px mobile gutter used everywhere. */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />;
}

/** Standard landing section with an optional eyebrow, title and subtitle. */
export function Section({
  id,
  title,
  subtitle,
  eyebrow,
  children,
  className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-16 sm:py-24", className)}>
      <Container>
        <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          {eyebrow && <p className="text-brand mb-3 text-sm font-semibold tracking-widest uppercase">{eyebrow}</p>}
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
          {subtitle && <p className="mt-4 text-base text-pretty text-muted sm:text-lg">{subtitle}</p>}
        </Reveal>
        {children}
      </Container>
    </section>
  );
}
