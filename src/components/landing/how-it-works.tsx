import { Reveal } from "@/components/ui/reveal";

export function HowItWorks({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="relative grid gap-4 md:grid-cols-4">
      {/* Connecting line behind the step numbers (desktop) */}
      <div className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-gradient-to-r from-accent-violet via-line-strong to-accent-cyan md:block" />
      {steps.map((s, i) => (
        <Reveal
          as="li"
          key={s.title}
          delay={i * 90}
          className="relative flex gap-4 md:flex-col md:items-center md:text-center"
        >
          <span className="bg-brand relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-white shadow-[0_0_30px_var(--glow-violet)]">
            {i + 1}
          </span>
          <div>
            <h3 className="font-semibold md:mt-5">{s.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{s.body}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}
