"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { designTokens as dt } from "@/lib/designTokens";
import type { GeoAiDailyBrief } from "@/lib/geoAiDailyBrief";

type BriefResponse = {
  ok?: boolean;
  report?: GeoAiDailyBrief | null;
  empty?: boolean;
  error?: string;
  storage?: { saved?: boolean; error?: string };
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not updated yet";
  return date.toLocaleString();
}

function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${dt.cardRadius} ${dt.border} bg-[rgba(11,13,24,0.72)] p-5`}>
      <p className={`text-sm font-semibold ${dt.textPrimary}`}>{title}</p>
      <p className={`mt-2 text-sm leading-relaxed ${dt.muted}`}>{body}</p>
    </div>
  );
}

function SourceList({ sources }: { sources: GeoAiDailyBrief["sources"] }) {
  const visible = sources.filter((source) => source.title || source.url).slice(0, 8);
  if (!visible.length) return null;

  return (
    <section className="border-t border-[color:var(--swift-border-subtle)] pt-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</h2>
      <ul className="mt-3 space-y-2">
        {visible.map((source, idx) => (
          <li key={`${source.url ?? source.title}-${idx}`} className="text-sm leading-relaxed">
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[color:var(--swift-accent-cyan)] underline-offset-2 hover:underline"
              >
                {source.title || source.source || source.url}
              </a>
            ) : (
              <span className={`font-medium ${dt.textPrimary}`}>{source.title}</span>
            )}
            {source.source ? <span className={dt.muted}> · {source.source}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BriefCard({ brief }: { brief: GeoAiDailyBrief }) {
  return (
    <article className={`${dt.cardRadius} ${dt.border} bg-[rgba(11,13,24,0.78)] p-5 shadow-2xl shadow-black/20 sm:p-7`}>
      <div className="flex flex-col gap-3 border-b border-[color:var(--swift-border-subtle)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Latest analysed report
          </p>
          <h2 className={`mt-2 text-xl font-semibold leading-snug ${dt.textPrimary}`}>
            {brief.headline}
          </h2>
        </div>
        <div className="shrink-0 rounded-full border border-[color:var(--swift-border-subtle)] bg-slate-950/45 px-3 py-1 text-xs font-medium text-slate-300">
          {brief.diagnostics.linksFetched}/{brief.diagnostics.linksFound} links fetched
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Executive summary
          </h2>
          <p className="mt-3 text-base leading-8 text-slate-200">{brief.executiveSummary}</p>
        </section>

        {brief.keyDevelopments.length ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Key developments
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
              {brief.keyDevelopments.map((item, idx) => (
                <li key={`development-${idx}`}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {brief.implications.length ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Implications
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
              {brief.implications.map((item, idx) => (
                <li key={`implication-${idx}`}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {brief.recommendedActions.length ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recommended actions
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
              {brief.recommendedActions.map((item, idx) => (
                <li key={`action-${idx}`}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <SourceList sources={brief.sources} />
      </div>
    </article>
  );
}

export default function Home() {
  const [brief, setBrief] = useState<GeoAiDailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const lastUpdatedLabel = useMemo(
    () => formatDateTime(brief?.lastUpdatedAt ?? brief?.generatedAt),
    [brief],
  );

  const loadLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/generate-report", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as BriefResponse;
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      setBrief(body.report ?? null);
      setEmpty(Boolean(body.empty || !body.report));
    } catch (e) {
      setBrief(null);
      setEmpty(false);
      setError(e instanceof Error ? e.message : "Latest brief could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadLatest();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLatest]);

  async function refreshBrief() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as BriefResponse;
      if (!res.ok || body.ok === false) {
        throw new Error(body.error || body.storage?.error || `HTTP ${res.status}`);
      }
      setBrief(body.report ?? null);
      setEmpty(Boolean(body.empty || !body.report));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brief refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className={dt.pageBg}>
      <div className={`mx-auto min-h-screen w-full ${dt.maxContent} ${dt.mainPadX} ${dt.mainPadY}`}>
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="flex flex-col gap-4 border-b border-[color:var(--swift-border-subtle)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={`text-xs font-semibold tracking-[0.25em] ${dt.muted}`}>SWIFT</p>
              <h1 className={`mt-3 text-3xl font-semibold tracking-normal sm:text-4xl ${dt.textPrimary}`}>
                GEO x AI Daily Brief
              </h1>
              <p className={`mt-3 max-w-2xl text-sm leading-6 ${dt.muted}`}>
                Latest executive analysis from the Gmail digest label.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => void refreshBrief()}
                disabled={refreshing}
                className={dt.primaryCta}
              >
                {refreshing ? "Refreshing brief..." : "Refresh brief"}
              </button>
              <p className={`text-xs ${dt.muted}`}>Last updated: {lastUpdatedLabel}</p>
            </div>
          </header>

          {loading ? (
            <StatePanel title="Loading brief" body="Checking the latest saved GEO x AI analysis." />
          ) : error ? (
            <StatePanel title="Brief unavailable" body={error} />
          ) : empty || !brief ? (
            <StatePanel
              title="No brief yet"
              body="No analysed report is available. Refresh the brief to read recent emails under the configured Gmail label."
            />
          ) : (
            <BriefCard brief={brief} />
          )}
        </div>
      </div>
    </main>
  );
}
