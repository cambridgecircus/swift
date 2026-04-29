"use client";

import { useMemo } from "react";

import { designTokens as dt } from "@/lib/designTokens";

export type SourceDropdownItem = {
  title: string;
  url?: string;
  publisher?: string;
  date?: string;
};

function clampText(input: string, maxChars: number): string {
  const t = (input ?? "").trim().replace(/\s+/g, " ");
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function looksLikeQueryOrDiagnostics(input: string): boolean {
  const t = (input ?? "").trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/google news|news\.google\.com|rss/i.test(t) && t.length > 40) return true;
  const opCount = (t.match(/\b(OR|AND|site:|intitle:|inurl:)\b/gi) ?? []).length;
  if (opCount >= 2 && t.length > 50) return true;
  if (t.includes("utm_") || t.includes("gclid=") || t.includes("fbclid=")) return true;
  return false;
}

function safeVisibleTitle(input: string, fallback: string, maxChars = 120): string {
  const t = (input ?? "").trim().replace(/\s+/g, " ");
  if (!t) return fallback;
  if (looksLikeQueryOrDiagnostics(t)) return fallback;
  return clampText(t, maxChars);
}

function urlToDomainLabel(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export default function SourceDropdown({
  sources,
  label,
  maxItems = 12,
  className = "",
}: {
  sources: SourceDropdownItem[];
  label?: string;
  maxItems?: number;
  className?: string;
}) {
  const cleaned = useMemo(() => {
    const out: Array<SourceDropdownItem & { domain?: string | null }> = [];
    const seen = new Set<string>();
    for (const s of sources ?? []) {
      const url = typeof s.url === "string" && s.url.trim() ? s.url.trim() : undefined;
      const title = safeVisibleTitle(String(s.title ?? ""), "Source", 140);
      const publisher = safeVisibleTitle(String(s.publisher ?? ""), "", 60) || undefined;
      const domain = url ? urlToDomainLabel(url) : null;
      const date = typeof s.date === "string" && s.date.trim() ? clampText(s.date.trim(), 28) : undefined;

      const key = [title.toLowerCase(), (publisher ?? "").toLowerCase(), (domain ?? "").toLowerCase(), (url ?? "").toLowerCase()].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, url, publisher, date, domain });
      if (out.length >= maxItems) break;
    }
    return out;
  }, [maxItems, sources]);

  if (!cleaned.length) return null;

  const n = cleaned.length;
  const summaryLabel = label ?? `View sources (${n})`;

  return (
    <details
      className={[
        "rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/35 p-3",
        className,
      ].join(" ")}
    >
      <summary className={`cursor-pointer text-sm font-semibold ${dt.accentText} hover:underline`}>
        {summaryLabel}
      </summary>
      <ul className="mt-3 space-y-2">
        {cleaned.map((s, idx) => {
          const meta = [s.publisher || null, s.domain || null, s.date || null].filter(Boolean).join(" · ");
          return (
            <li
              key={`src-row-${idx}-${String(s.url ?? s.title).slice(0, 24)}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className={`text-sm font-medium ${dt.textPrimary} line-clamp-2`}>{s.title}</p>
                <p className={`mt-0.5 text-[11px] ${dt.muted}`}>{meta || "—"}</p>
              </div>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 text-xs font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
                >
                  Open source
                </a>
              ) : (
                <span className={`shrink-0 text-xs ${dt.muted}`}>—</span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

