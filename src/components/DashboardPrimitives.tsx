import type { ReactNode } from "react";

import { designTokens as dt } from "@/lib/designTokens";

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: "neutral" | "strong" | "live" | "warning" | "ai";
  children: ReactNode;
  className?: string;
}) {
  const styles =
    tone === "live"
      ? dt.pillStatusLive
      : tone === "warning"
        ? dt.pillWarning
        : tone === "strong"
          ? dt.pillAccent
          : tone === "ai"
            ? dt.pillAi
            : dt.pillNeutral;
  return (
    <span
      className={[
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        styles,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={[dt.metricStatCard, "p-4 sm:p-5", className].filter(Boolean).join(" ")}>
      <p className={dt.labelCaps}>{label}</p>
      <p className={`mt-1 ${dt.metricValueLg}`}>{value}</p>
    </div>
  );
}

export function NestedPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[dt.nestedPanel, "p-4 sm:p-5", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function DetailsPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[dt.detailsPanel, "p-3 sm:p-4", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function InlineActionLink({
  children,
  href,
  className = "",
}: {
  children: ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "inline-flex items-center gap-2 text-xs font-semibold",
        dt.accentText,
        dt.accentTextHover,
        "underline-offset-4 hover:underline",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </a>
  );
}

