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

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning";
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
      ].join(" ")}
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
      className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [lastHeadline, setLastHeadline] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        <Sidebar active={active} onSelect={setActive} items={navItems} />

        <div className="flex-1 px-5 py-8 md:px-10 md:py-10">
          {active === "dashboard" ? (
            <div className="space-y-6">
              <SectionHeader
                title="Dashboard"
                subtitle="A premium, executive dashboard mock that keeps SWIFT deployable on Vercel while your protected cron-driven email loop stays on the server."
                right={
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <PrimaryButton
                      onClick={refreshIntelligencePreview}
                      disabled={refreshing}
                    >
                      {refreshing
                        ? "Refreshing..."
                        : "Refresh Intelligence & Send Report"}
                    </PrimaryButton>
                    <p className="text-xs text-slate-400">
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

              <div className="grid gap-5 lg:grid-cols-2">
                <InfoCard
                  title={web3AiBrief.title}
                  subtitle="Signals curated for the Web3 x AI operating environment."
                  right={<Pill>Last refreshed: {formatDateTime(lastRefreshedAt)}</Pill>}
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {web3AiBrief.headline}
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
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
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                    {hrbpBrief.signals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </InfoCard>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
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
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
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
            <div className="space-y-6">
              <SectionHeader
                title="Job Opportunities"
                subtitle="Mock opportunity intelligence: feed → takeaways → role fit analysis."
                right={<Pill tone="warning">Mock data</Pill>}
              />

              <div className="grid gap-5 lg:grid-cols-3">
                <InfoCard
                  title="Opportunity Feed"
                  subtitle="Top roles worth tracking this week."
                >
                  <div className="space-y-3">
                    {mockOpportunities.map((opp) => (
                      <div
                        key={`${opp.company}-${opp.role}`}
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                        className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
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
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-sm font-semibold text-slate-100">
                          Convert Drafting → Ready to Present
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          Package 2–3 assets into exec-ready decks with clear actions and
                          operating metrics.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
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
            <div className="space-y-6">
              <SectionHeader
                title="Settings"
                subtitle="Mock configuration layout (not yet functional)."
                right={<Pill tone="warning">Read-only</Pill>}
              />

              <div className="grid gap-5 lg:grid-cols-2">
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
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-slate-100">
                      {mockSettings.emailRecipient}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Sending is handled server-side by the protected daily cron route.
                    </p>
                  </div>
                </InfoCard>

                <InfoCard
                  title="Refresh Schedule"
                  subtitle="How often intelligence should refresh."
                >
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-slate-100">
                      {mockSettings.refreshSchedule}
                    </p>
                  </div>
                </InfoCard>

                <InfoCard title="AI Provider" subtitle="Model provider setting.">
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-slate-100">
                      {mockSettings.aiProvider}
                    </p>
                  </div>
                </InfoCard>

                <InfoCard title="Skill Layer" subtitle="Capability layer preset.">
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-slate-100">
                      {mockSettings.skillLayer}
                    </p>
                  </div>
                </InfoCard>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
