import type { ReactNode } from "react";

export default function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-3">{right}</div> : null}
    </div>
  );
}

