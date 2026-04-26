import type { ReactNode } from "react";

export default function InfoCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

