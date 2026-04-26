import type { ReactNode } from "react";

import { designTokens as dt } from "@/lib/designTokens";

export default function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-5 border-b ${dt.border} pb-6 md:flex-row md:items-end md:justify-between`}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl md:text-[1.75rem] md:leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <div
            className={`mt-2 max-w-3xl text-sm leading-relaxed sm:text-[0.9375rem] ${dt.muted}`}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {right ? (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center md:pb-0.5">
          {right}
        </div>
      ) : null}
    </div>
  );
}
