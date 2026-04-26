import type { ReactNode } from "react";

import { designTokens as dt } from "@/lib/designTokens";

export default function InfoCard({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  /** Optional extra classes (e.g. col-span-full). */
  className?: string;
}) {
  return (
    <section
      className={[
        dt.cardRadius,
        dt.border,
        dt.cardBg,
        dt.cardPadding,
        className,
      ].join(" ")}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          {subtitle ? (
            <p className={`mt-1.5 text-xs leading-relaxed sm:text-sm ${dt.muted}`}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {right ? <div className="shrink-0 sm:pt-0.5">{right}</div> : null}
      </header>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
