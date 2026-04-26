"use client";

import { useMemo, useState, type ReactNode } from "react";

import InfoCard from "@/components/InfoCard";
import LearningAssetCard from "@/components/LearningAssetCard";
import type { NavItem, NavKey } from "@/components/Sidebar";
import Sidebar from "@/components/Sidebar";
import SectionHeader from "@/components/SectionHeader";
import {
  mockLearningAssets,
  mockMonthlyChangeLog,
  mockOpportunities,
  mockSettings,
  mockSkills,
} from "@/lib/mockData";
import {
  historicalJobLinks,
  jobApplicationChannels,
  suggestedNewChannels,
} from "@/lib/jobSourceMemory";
import { designTokens as dt } from "@/lib/designTokens";
import { isRealJobApplyUrl } from "@/lib/jobApplyUrl";
import { sourceRegistry } from "@/lib/sourceRegistry";

type DashboardBrief = {
  title: string;
  headline: string;
  signals: string[];
};

const web3AiBrief: DashboardBrief = {
  title: "Web3 x AI Daily Brief",
  headline: "Operators are replacing hype with execution discipline.",
  signals: [
    "Compliance-ready growth is becoming a hiring constraint, not a side note.",
    "AI adoption is shifting from tooling to operating model redesign.",
    "Lean teams are prioritising role criticality and decision quality.",
  ],
};

const hrbpBrief: DashboardBrief = {
  title: "HRBP Daily Brief",
  headline: "Executives want fewer dashboards and more decisions.",
  signals: [
    "Capability mapping is the new baseline for hiring plans.",
    "Performance cadence is moving to shorter, signal-driven loops.",
    "People analytics must translate into actions, not observations.",
  ],
};

const tierPillLayout =
  "inline-flex min-w-[64px] items-center justify-center whitespace-nowrap";

function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning";
  className?: string;
}) {
  const styles =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-slate-950/40 text-slate-200";
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

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={dt.accentButton}
    >
      {children}
    </button>
  );
}

function formatDateTime(date: Date | null) {
  if (!date) return "Not refreshed yet";
  return date.toLocaleString();
}

export default function Home() {
  const navItems: NavItem[] = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "jobOpportunities", label: "Job Opportunities" },
      { key: "skills", label: "Skills to Pick Up" },
      { key: "learningAssets", label: "Learning Assets" },
      { key: "settings", label: "Settings" },
    ],
    [],
  );

  const [active, setActive] = useState<NavKey>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [lastHeadline, setLastHeadline] = useState<string | null>(null);

  const activeSectionLabel = useMemo(() => {
    const item = navItems.find((n) => n.key === active);
    return item?.label ?? "SWIFT";
  }, [active, navItems]);

  const registryTableRows = useMemo(
    () =>
      [...sourceRegistry].sort(
        (a, b) => a.topic.localeCompare(b.topic) || a.name.localeCompare(b.name),
      ),
    [],
  );

  const sourceRegistrySummary = useMemo(() => {
    const total = sourceRegistry.length;
    const enabled = sourceRegistry.filter((s) => s.enabled).length;
    const rssEnabled = sourceRegistry.filter(
      (s) => s.enabled && s.sourceType === "rss",
    ).length;
    const planned = {
      api: sourceRegistry.filter((s) => !s.enabled && s.sourceType === "api").length,
      jsonFeed: sourceRegistry.filter((s) => !s.enabled && s.sourceType === "json_feed")
        .length,
      manual: sourceRegistry.filter(
        (s) => !s.enabled && (s.sourceType === "manual" || s.accessType === "manual_review"),
      ).length,
    };

    const topics = ["web3", "ai", "hr", "jobs", "learning"] as const;
    const grouped = topics.map((topic) => ({
      topic,
      sources: sourceRegistry.filter((s) => s.topic === topic),
    }));

    return { total, enabled, rssEnabled, planned, grouped };
  }, []);

  async function refreshIntelligencePreview() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/generate-report", { method: "POST" });
      if (!response.ok) throw new Error("API request failed");
      const data = (await response.json()) as { headline?: string };
      setLastHeadline(data.headline ?? null);
      setLastRefreshedAt(new Date());
    } catch (error) {
      console.error(error);
      alert("Failed to refresh intelligence. Please check the terminal logs.");
    } finally {
      setRefreshing(false);
    }
  }

  const insetCard = `${dt.cardRadius} ${dt.border} ${dt.cardInset} p-4 sm:p-5`;

  return (
    <main className={dt.pageBg}>
      <header className={dt.mobileHeader}>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`inline-flex items-center gap-2 rounded-lg ${dt.border} px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/5`}
        >
          <svg
            className="h-5 w-5 shrink-0 text-cyan-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Menu
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-slate-500">
            SWIFT
          </p>
          <p className="truncate text-sm font-semibold text-slate-100">
            {activeSectionLabel}
          </p>
        </div>
        <span className="inline-block w-[4.5rem]" aria-hidden />
      </header>

      <div
        className={`mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col md:min-h-screen md:flex-row ${dt.maxContent}`}
      >
        <Sidebar
          active={active}
          onSelect={setActive}
          items={navItems}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        <div
          className={`min-w-0 flex-1 overflow-x-hidden ${dt.mainPadX} ${dt.mainPadY}`}
        >
          {active === "dashboard" ? (
            <div className="space-y-8 md:space-y-10">
              <SectionHeader
                title="Dashboard"
                subtitle="A premium, executive dashboard mock that keeps SWIFT deployable on Vercel while your protected cron-driven email loop stays on the server."
                right={
                  <div className="flex w-full max-w-md flex-col gap-3 md:w-auto md:max-w-none md:items-end">
                    <PrimaryButton
                      onClick={refreshIntelligencePreview}
                      disabled={refreshing}
                    >
                      {refreshing
                        ? "Refreshing..."
                        : "Refresh Intelligence & Send Report"}
                    </PrimaryButton>
                    <p className={`text-xs leading-relaxed ${dt.muted}`}>
                      For now this calls{" "}
                      <span className="font-semibold text-slate-200">
                        /api/generate-report
                      </span>{" "}
                      (no secrets exposed). Email sending is handled by the
                      protected{" "}
                      <span className="font-semibold text-slate-200">
                        /api/daily-report
                      </span>{" "}
                      cron endpoint.
                    </p>
                  </div>
                }
              />

              <div className="grid gap-6 lg:grid-cols-2">
                <InfoCard
                  title={web3AiBrief.title}
                  subtitle="Signals curated for the Web3 x AI operating environment."
                  right={<Pill>Last refreshed: {formatDateTime(lastRefreshedAt)}</Pill>}
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {web3AiBrief.headline}
                  </p>
                  <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-slate-300">
                    {web3AiBrief.signals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </InfoCard>

                <InfoCard
                  title={hrbpBrief.title}
                  subtitle="HRBP-specific takeaways to drive next actions."
                  right={<Pill>Last refreshed: {formatDateTime(lastRefreshedAt)}</Pill>}
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {hrbpBrief.headline}
                  </p>
                  <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-slate-300">
                    {hrbpBrief.signals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </InfoCard>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <InfoCard
                  title="Strong Signals"
                  subtitle="High-conviction items with HRBP implications."
                >
                  <div className="space-y-3">
                    {[
                      {
                        type: "Operating model",
                        why: "AI work is moving from pilots to decision-right redesign.",
                        implication:
                          "Run a work decomposition workshop with leaders and define ownership/metrics.",
                      },
                      {
                        type: "Hiring",
                        why: "Role criticality is replacing broad headcount plans.",
                        implication:
                          "Build capability maps and challenge hiring requests with productivity alternatives.",
                      },
                      {
                        type: "Risk posture",
                        why: "Compliance requirements are shaping org structure earlier.",
                        implication:
                          "Partner with Legal/Compliance to define workforce readiness and ER risk controls.",
                      },
                    ].map((item) => (
                      <div
                        key={item.type}
                        className={insetCard}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-100">
                            {item.type}
                          </p>
                          <Pill tone="success">Strong</Pill>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">
                          <span className="font-semibold text-slate-200">
                            Why it matters:
                          </span>{" "}
                          {item.why}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          <span className="font-semibold text-slate-200">
                            HRBP implication:
                          </span>{" "}
                          {item.implication}
                        </p>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Job Opportunity Snapshot"
                  subtitle="Top opportunities surfaced from the feed."
                  right={<Pill tone="warning">Mock</Pill>}
                >
                  <div className="space-y-3">
                    {mockOpportunities.slice(0, 3).map((opp) => (
                      <div
                        key={`${opp.company}-${opp.role}`}
                        className={insetCard}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">
                              {opp.role}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {opp.company} • {opp.location}
                            </p>
                          </div>
                          <Pill>{opp.fitScore} fit</Pill>
                        </div>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Latest preview"
                  subtitle="The most recent headline returned by your report generator."
                >
                  <div className={insetCard}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Headline
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-100">
                      {lastHeadline ?? "No preview yet — refresh to generate."}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Last refreshed: {formatDateTime(lastRefreshedAt)}
                    </p>
                  </div>
                </InfoCard>
              </div>
            </div>
          ) : null}

          {active === "jobOpportunities" ? (
            <div className="space-y-8 md:space-y-10">
              <SectionHeader
                title="Job Opportunities"
                subtitle={
                  <>
                    <p>
                      DeepSeek currently enhances market intelligence reports. Job ingestion is
                      not connected yet.
                    </p>
                    <p className="mt-2">
                      Mock opportunity intelligence below is illustrative: feed → takeaways → role
                      fit analysis.
                    </p>
                  </>
                }
                right={
                  <Pill tone="warning">Mock job data — real job ingestion pending</Pill>
                }
              />

              <div className="grid gap-6 lg:grid-cols-3">
                <InfoCard
                  title="Opportunity Feed"
                  subtitle="Top roles worth tracking this week."
                >
                  <div className="space-y-4">
                    {mockOpportunities.map((opp) => (
                      <div
                        key={`${opp.company}-${opp.role}`}
                        className={insetCard}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">
                              {opp.role}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {opp.company} • {opp.location}
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                              Source: {opp.source}
                            </p>
                          </div>
                          <Pill>{opp.fitScore} fit</Pill>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">
                          {opp.whyThisFits}
                        </p>
                        <div className="mt-4 space-y-2">
                          {isRealJobApplyUrl(opp.applyUrl) ? (
                            <a
                              href={opp.applyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center justify-center ${dt.cardRadius} ${dt.accentBorder} ${dt.accentSoftBg} px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15`}
                            >
                              Apply
                            </a>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled
                                className={`inline-flex cursor-not-allowed items-center justify-center ${dt.cardRadius} border border-white/10 bg-slate-950/50 px-3 py-2 text-sm font-semibold text-slate-500`}
                              >
                                {opp.applyUrl?.trim() ? "Mock only" : "Apply unavailable"}
                              </button>
                              <p className={`text-xs ${dt.muted}`}>
                                Real application link will appear after job ingestion is connected.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Job Market Takeaways"
                  subtitle="What the feed implies for HRBP operators."
                >
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                    <li>
                      Roles are clustering around compliance + execution rather than
                      “growth at all costs”.
                    </li>
                    <li>
                      People partners are expected to ship operating rhythms, not just
                      advise.
                    </li>
                    <li>
                      Fit scores increasingly depend on analytics-to-actions fluency.
                    </li>
                  </ul>
                </InfoCard>

                <InfoCard
                  title="Role Fit Analysis"
                  subtitle="Gaps and next actions to improve match quality."
                >
                  <div className="space-y-4">
                    {mockOpportunities.slice(0, 2).map((opp) => (
                      <div
                        key={`${opp.company}-${opp.role}-analysis`}
                        className={insetCard}
                      >
                        <p className="text-sm font-semibold text-slate-100">
                          {opp.company}: {opp.role}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          <span className="font-semibold text-slate-200">
                            Recommended action:
                          </span>{" "}
                          {opp.recommendedAction}
                        </p>
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Gaps
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                            {opp.gaps.map((gap) => (
                              <li key={gap}>{gap}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </InfoCard>
              </div>
            </div>
          ) : null}

          {active === "skills" ? (
            <div className="space-y-6">
              <SectionHeader
                title="Skills to Pick Up"
                subtitle="Mock skill intelligence: priority skills, evidence, learning plan, and related outputs."
                right={<Pill tone="warning">Mock data</Pill>}
              />

              <div className="grid gap-5 lg:grid-cols-3">
                <InfoCard
                  title="Priority Skills"
                  subtitle="What to build next to increase leverage."
                >
                  <div className="space-y-3">
                    {mockSkills.map((s) => (
                      <div
                        key={s.skill}
                        className={insetCard}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-100">
                            {s.skill}
                          </p>
                          <Pill>{s.priority}</Pill>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{s.category}</p>
                        <p className="mt-3 text-sm text-slate-300">{s.nextAction}</p>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Evidence"
                  subtitle="Why these skills matter right now."
                >
                  <div className="space-y-3">
                    {mockSkills.map((s) => (
                      <div
                        key={`${s.skill}-evidence`}
                        className={insetCard}
                      >
                        <p className="text-sm font-semibold text-slate-100">
                          {s.skill}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">{s.evidence}</p>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Learning Plan"
                  subtitle="Current → target levels and linked outputs."
                >
                  <div className="space-y-3">
                    {mockSkills.map((s) => (
                      <div
                        key={`${s.skill}-plan`}
                        className={insetCard}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-100">
                            {s.skill}
                          </p>
                          <Pill>
                            {s.currentLevel} → {s.targetLevel}
                          </Pill>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">
                          <span className="font-semibold text-slate-200">
                            Related output:
                          </span>{" "}
                          {s.relatedAsset}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          <span className="font-semibold text-slate-200">
                            Next action:
                          </span>{" "}
                          {s.nextAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </InfoCard>
              </div>
            </div>
          ) : null}

          {active === "learningAssets" ? (
            <div className="space-y-6">
              <SectionHeader
                title="Learning Assets"
                subtitle="15-topic library with mock status, demand signals, and planned outputs."
                right={<Pill tone="warning">Mock data</Pill>}
              />

              <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="grid gap-5 md:grid-cols-2">
                    {mockLearningAssets.map((asset) => (
                      <LearningAssetCard key={asset.topic} asset={asset} />
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  <InfoCard
                    title="Monthly Change Log"
                    subtitle="Mock library change history for this month."
                  >
                    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                      {mockMonthlyChangeLog.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </InfoCard>

                  <InfoCard
                    title="Library Focus"
                    subtitle="What to generate next for leadership."
                  >
                    <div className="space-y-3">
                      <div className={insetCard}>
                        <p className="text-sm font-semibold text-slate-100">
                          Convert Drafting → Ready to Present
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          Package 2–3 assets into exec-ready decks with clear actions and
                          operating metrics.
                        </p>
                      </div>
                      <div className={insetCard}>
                        <p className="text-sm font-semibold text-slate-100">
                          Tie each asset to an HRBP output
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          Each learning topic should map to a repeatable deliverable: a
                          cadence, a decision memo, or a playbook.
                        </p>
                      </div>
                    </div>
                  </InfoCard>
                </div>
              </div>
            </div>
          ) : null}

          {active === "settings" ? (
            <div className="mx-auto w-full max-w-none space-y-10 md:space-y-12">
              <SectionHeader
                title="Settings"
                subtitle="Mock configuration layout (not yet functional). Layout uses full width so registry tables and job memory stay readable."
                right={<Pill tone="warning">Read-only</Pill>}
              />

              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Intelligence pipeline
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      RSS ingestion
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">Enabled</p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Cleaning rules
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">Enabled</p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      AI analysis
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      DeepSeek (optional)
                    </p>
                    <p className={`mt-2 text-xs ${dt.muted}`}>
                      When <code className="text-slate-300">DEEPSEEK_API_KEY</code> and{" "}
                      <code className="text-slate-300">AI_PROVIDER=deepseek</code> are set on the
                      server, reports use the API; otherwise the rules-based path runs.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Storage
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      Not connected yet
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Source registry summary
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Total sources
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-50">
                      {sourceRegistrySummary.total}
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Enabled
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-50">
                      {sourceRegistrySummary.enabled}
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      RSS enabled
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-50">
                      {sourceRegistrySummary.rssEnabled}
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Planned (API / JSON / Manual)
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-100">
                      {sourceRegistrySummary.planned.api} /{" "}
                      {sourceRegistrySummary.planned.jsonFeed} /{" "}
                      {sourceRegistrySummary.planned.manual}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Configuration
                </h2>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoCard title="Sources" subtitle="Where SWIFT pulls signals from.">
                    <div className="flex flex-wrap gap-2">
                      {mockSettings.sources.map((s) => (
                        <Pill key={s}>{s}</Pill>
                      ))}
                    </div>
                  </InfoCard>

                  <InfoCard
                    title="Search Keywords"
                    subtitle="Queries used to collect market signals."
                  >
                    <div className="flex flex-wrap gap-2">
                      {mockSettings.searchKeywords.map((k) => (
                        <Pill key={k}>{k}</Pill>
                      ))}
                    </div>
                  </InfoCard>

                  <InfoCard title="Email Recipient" subtitle="Where reports are sent.">
                    <div className={insetCard}>
                      <p className="text-sm font-semibold text-slate-100">
                        {mockSettings.emailRecipient}
                      </p>
                      <p className={`mt-2 text-xs ${dt.muted}`}>
                        Sending is handled server-side by the protected daily cron route.
                      </p>
                    </div>
                  </InfoCard>

                  <InfoCard
                    title="Refresh Schedule"
                    subtitle="How often intelligence should refresh."
                  >
                    <div className={insetCard}>
                      <p className="text-sm font-semibold text-slate-100">
                        {mockSettings.refreshSchedule}
                      </p>
                    </div>
                  </InfoCard>

                  <InfoCard
                    title="AI Provider"
                    subtitle="DeepSeek is used only on the server. The browser never sees your API key."
                  >
                    <div className={insetCard}>
                      <p className="text-sm font-semibold text-slate-100">
                        {mockSettings.aiProvider}
                      </p>
                      <p className={`mt-2 text-xs ${dt.muted}`}>
                        Configure <code className="text-slate-300">DEEPSEEK_API_KEY</code> and{" "}
                        <code className="text-slate-300">AI_PROVIDER=deepseek</code> in{" "}
                        <code className="text-slate-300">.env.local</code> (see{" "}
                        <code className="text-slate-300">.env.local.example</code>). Keys stay in
                        server environment variables only.
                      </p>
                    </div>
                  </InfoCard>

                  <InfoCard title="Skill Layer" subtitle="Capability layer preset.">
                    <div className={insetCard}>
                      <p className="text-sm font-semibold text-slate-100">
                        {mockSettings.skillLayer}
                      </p>
                    </div>
                  </InfoCard>
                </div>
              </section>

              <section className="space-y-6">
                <InfoCard
                  title="Job Application Channels"
                  subtitle="Saved application channels (mock memory until ingestion is connected)."
                >
                  <div className={`overflow-x-auto ${dt.cardRadius} ${dt.border}`}>
                    <table className="min-w-[640px] w-full text-left text-sm md:min-w-0">
                      <thead className={`${dt.cardInset} text-[11px] uppercase tracking-wide text-slate-400`}>
                        <tr>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-4 py-3 font-semibold">Enabled</th>
                          <th className="px-4 py-3 font-semibold">Tier</th>
                          <th className="px-4 py-3 font-semibold">Last checked</th>
                          <th className="px-4 py-3 font-semibold">URL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {jobApplicationChannels.map((c) => (
                          <tr key={c.id} className="align-top text-slate-200">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-100">{c.name}</div>
                              <div className={`mt-1 text-xs ${dt.muted}`}>{c.topic}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Pill>{c.channelType}</Pill>
                            </td>
                            <td className="px-4 py-3">
                              {c.enabled ? (
                                <Pill tone="success">Enabled</Pill>
                              ) : (
                                <Pill tone="warning">Disabled</Pill>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Pill>{c.qualityTier}</Pill>
                            </td>
                            <td className={`px-4 py-3 text-xs ${dt.muted}`}>
                              {c.lastCheckedAt ? new Date(c.lastCheckedAt).toLocaleString() : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`text-sm font-semibold ${dt.accentText} ${dt.accentTextHover}`}
                              >
                                Open
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </InfoCard>

                <InfoCard
                  title="Historical Job Links"
                  subtitle="Preserved job links and application status (mock examples)."
                >
                  <div className="space-y-4">
                    {historicalJobLinks.map((j) => (
                      <div key={j.id} className={insetCard}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100">{j.role}</p>
                            <p className={`mt-1 text-xs ${dt.muted}`}>
                              {j.company} • {j.location} • {j.source}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill>{j.fitScore} fit</Pill>
                            <Pill>{j.applicationStatus}</Pill>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-slate-300">{j.whyThisFits}</p>
                        <div className="mt-4 flex flex-col gap-2">
                          {isRealJobApplyUrl(j.applyUrl) ? (
                            <a
                              href={j.applyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex w-fit items-center justify-center ${dt.cardRadius} ${dt.accentBorder} ${dt.accentSoftBg} px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15`}
                            >
                              Apply link
                            </a>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled
                                className={`inline-flex w-fit cursor-not-allowed items-center justify-center ${dt.cardRadius} border border-white/10 bg-slate-950/50 px-3 py-2 text-sm font-semibold text-slate-500`}
                              >
                                {j.applyUrl?.trim() ? "Mock only" : "Apply unavailable"}
                              </button>
                              <p className={`text-xs ${dt.muted}`}>
                                Real application link will appear after job ingestion is connected.
                              </p>
                            </>
                          )}
                        </div>
                        {j.notes ? <p className={`mt-3 text-xs ${dt.muted}`}>{j.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Suggested New Channels"
                  subtitle="Potential new application channels to add (mock suggestions)."
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    {suggestedNewChannels.map((c) => (
                      <div key={c.id} className={insetCard}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100">{c.channelName}</p>
                            <p className={`mt-1 text-xs ${dt.muted}`}>{c.channelType}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill>{c.priority}</Pill>
                            <Pill>{c.status}</Pill>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-slate-300">{c.reasonToAdd}</p>
                        <p className={`mt-2 text-xs ${dt.muted}`}>
                          Expected signal: {c.expectedSignal}
                        </p>
                        <div className="mt-3">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-sm font-semibold ${dt.accentText} ${dt.accentTextHover}`}
                          >
                            Open
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Source Health"
                  subtitle="Quality control for enabled RSS sources (non-interactive)."
                >
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className={insetCard}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Source health
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">Enabled</p>
                    </div>
                    <div className={insetCard}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        How to inspect
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">
                        /api/debug/source-health
                      </p>
                      <p className={`mt-2 text-xs ${dt.muted}`}>
                        Safe to call from the browser. No secrets.
                      </p>
                    </div>
                    <div className={insetCard}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Known disabled sources
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                        <li>a16z crypto — pending verified feed URL</li>
                        <li>Hacking HR — pending verified feed URL</li>
                      </ul>
                    </div>
                  </div>
                </InfoCard>
              </section>

              <InfoCard
                title="Source Registry"
                subtitle="All sources in one scan-friendly view. Desktop: table. Mobile: stacked cards."
                className="w-full"
              >
                <div className={`hidden lg:block ${dt.cardRadius} ${dt.border} overflow-x-auto`}>
                  <table className="min-w-full text-left text-sm">
                    <thead className={`${dt.cardInset} text-[11px] uppercase tracking-wide text-slate-400`}>
                      <tr>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Topic</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Tier</th>
                        <th className="px-4 py-3 font-semibold">Enabled</th>
                        <th className="px-4 py-3 font-semibold">Used by</th>
                        <th className="px-4 py-3 font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {registryTableRows.map((s) => (
                        <tr key={s.id} className="align-top text-slate-200">
                          <td className="px-4 py-3 font-semibold text-slate-100">{s.name}</td>
                          <td className="px-4 py-3 text-xs uppercase text-slate-300">{s.topic}</td>
                          <td className="px-4 py-3">
                            <Pill>{s.sourceType}</Pill>
                          </td>
                          <td className="px-4 py-3">
                            <Pill className={tierPillLayout}>{s.qualityTier}</Pill>
                          </td>
                          <td className="px-4 py-3">
                            {s.enabled ? (
                              <Pill tone="success">Enabled</Pill>
                            ) : (
                              <Pill tone="warning">Off</Pill>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-[14rem] flex-wrap items-center gap-1.5">
                              {s.usedBy.map((u) => (
                                <Pill key={`${s.id}-${u}`}>{u}</Pill>
                              ))}
                            </div>
                          </td>
                          <td className={`max-w-xs px-4 py-3 text-xs leading-relaxed ${dt.muted}`}>
                            {s.notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 lg:hidden">
                  {registryTableRows.map((s) => (
                    <div key={`m-${s.id}`} className={insetCard}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">{s.name}</p>
                        <Pill>{s.topic}</Pill>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Pill>{s.sourceType}</Pill>
                        <Pill className={tierPillLayout}>{s.qualityTier}</Pill>
                        {s.enabled ? (
                          <Pill tone="success">Enabled</Pill>
                        ) : (
                          <Pill tone="warning">Off</Pill>
                        )}
                      </div>
                      <p className={`mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}>
                        Used by
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {s.usedBy.map((u) => (
                          <Pill key={`${s.id}-m-${u}`}>{u}</Pill>
                        ))}
                      </div>
                      <p className={`mt-3 text-xs leading-relaxed ${dt.muted}`}>{s.notes}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
