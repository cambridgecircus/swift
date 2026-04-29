"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import InfoCard from "@/components/InfoCard";
import LearningAssetCard from "@/components/LearningAssetCard";
import { DetailsPanel, NestedPanel, StatusBadge } from "@/components/DashboardPrimitives";
import type { NavItem, NavKey } from "@/components/Sidebar";
import Sidebar from "@/components/Sidebar";
import SectionHeader from "@/components/SectionHeader";
import SourceDropdown from "@/components/SourceDropdown";
import { mockLearningAssets, mockOpportunities, mockSkills } from "@/lib/mockData";
import { jobApplicationChannels, suggestedNewChannels } from "@/lib/jobSourceMemory";
import { designTokens as dt } from "@/lib/designTokens";
import { isRealJobApplyUrl } from "@/lib/jobApplyUrl";
import { swiftPrimaryJobSearchProfile } from "@/lib/jobSearchProfiles";
import type { LiveJobIngestionResponse } from "@/lib/jobIngestion";
import { sourceRegistry } from "@/lib/sourceRegistry";
import {
  dedupeAndSortLiveJobs,
  mapCtxJobRecordToWeeklyLiveJob,
  mapDbJobRowToWeeklyLiveJob,
  type WeeklySummaryLiveJob,
  type WeeklySummaryResult,
} from "@/lib/intelligenceStorage";
import {
  isLinkedInImportIncomplete,
  LINKEDIN_PLACEHOLDER_COMPANY,
  LINKEDIN_PLACEHOLDER_LOCATION,
  LINKEDIN_PLACEHOLDER_ROLE,
} from "@/lib/linkedinJobAlertIngestion";
import { runDiagnosticsFingerprint, type RunDiagnostics } from "@/lib/runDiagnostics";
import type { LiveLearningAsset, LiveSkillToPickUp, LiveSkillsAndLearningResult } from "@/lib/skillsAndLearning";
import { normalizeDashboardReport, type DashboardReport } from "@/lib/dashboardReportMapper";

type DashboardBrief = {
  title: string;
  headline: string;
  signals: string[];
};

const SOURCE_TOPIC_LABEL: Record<string, string> = {
  web3: "Web3",
  ai: "AI",
  hr: "HR & people",
  jobs: "Jobs",
  learning: "Learning",
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

function cleanTextArray(input: Array<string | null | undefined>, limit = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const t = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

function clampText(input: string, maxChars: number): string {
  const t = input.trim().replace(/\s+/g, " ");
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function looksLikeQueryOrDiagnostics(input: string): boolean {
  const t = input.trim();
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

function jobDisplayFallbackRole(role: string): string {
  const t = (role ?? "").trim();
  if (!t) return "LinkedIn Job Alert — Needs Review";
  if (looksLikeQueryOrDiagnostics(t)) return "LinkedIn Job Alert — Needs Review";
  return t;
}

function jobDisplayFallbackCompany(company: string): string {
  const t = (company ?? "").trim();
  if (!t) return "Company to verify";
  if (looksLikeQueryOrDiagnostics(t)) return "Company to verify";
  return t;
}

function jobDisplayFallbackLocation(location: string): string {
  const t = (location ?? "").trim();
  if (!t) return "Location to verify";
  if (looksLikeQueryOrDiagnostics(t)) return "Location to verify";
  return t;
}

function dedupeForSnapshot<T>(
  rows: T[],
  keyFn: (row: T) => string,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// Brief mapping is centralised in `dashboardReportMapper`.

function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "accent" | "ai";
  className?: string;
}) {
  const styles =
    tone === "success"
      ? dt.pillStatusLive
      : tone === "warning"
        ? dt.pillWarning
        : tone === "accent"
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={[
        "h-4 w-4 shrink-0 transition-transform duration-200",
        open ? "rotate-180" : "rotate-0",
      ].join(" ")}
    >
      <path
        d="M5 7.75L10 12.25L15 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "grid transition-[grid-template-rows] duration-300 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      ].join(" ")}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function AccordionSection({
  title,
  subtitle,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={`${dt.cardRadius} ${dt.border} ${dt.cardBg}`}
    >
      <summary
        className={`cursor-pointer list-none ${dt.cardPadding}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${dt.textPrimary}`}>{title}</p>
            {subtitle ? (
              <p className={`mt-1.5 text-xs leading-relaxed sm:text-sm ${dt.muted}`}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {status ? <div className="shrink-0 sm:pt-0.5">{status}</div> : null}
        </div>
      </summary>
      <div className={`${dt.cardPadding} pt-0`}>{children}</div>
    </details>
  );
}

function formatDateTime(date: Date | null) {
  if (!date) return "Not refreshed yet";
  return date.toLocaleString();
}

type KeySignalPreview = {
  title: string;
  source: string;
  implication: string;
  sourceUrl?: string;
};

function primaryJobHref(j: { applyUrl?: string; sourceUrl?: string }): string {
  const u = j.applyUrl?.trim();
  if (u && isRealJobApplyUrl(u)) return u;
  const s = j.sourceUrl?.trim();
  return s && s.length > 0 ? s : "#";
}

function LiveJobsDetailsList({
  jobs,
  hasMore,
  listClassName = "",
}: {
  jobs: WeeklySummaryLiveJob[];
  hasMore: boolean;
  listClassName?: string;
}) {
  if (!jobs.length) return null;
  return (
    <>
      <ul
        className={`mt-2 max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-1 ${listClassName}`}
      >
        {jobs.map((j, idx) => {
          const href = primaryJobHref(j);
          const loc = [j.location, j.source].filter(Boolean).join(" · ");
          return (
            <li key={`${j.role}-${j.company}-${idx}`} className="text-sm">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-medium ${dt.accentText} ${dt.accentTextHover} underline-offset-2 hover:underline`}
              >
                {j.role} — {j.company || "—"}
              </a>
              {loc ? (
                <p className={`mt-0.5 text-[11px] leading-snug ${dt.muted}`}>{loc}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <p className={`mt-2 text-[11px] ${dt.muted}`}>Showing top 20 live jobs.</p>
      ) : null}
    </>
  );
}

function extractHttpUrls(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s\])"'<>]+/gi);
  return m ? [...new Set(m)] : [];
}

function stripUrlsFromText(text: string, urls: string[]): string {
  let t = text;
  for (const u of urls) t = t.split(u).join(" ");
  const cleaned = t.replace(/\s{2,}/g, " ").trim();
  return cleaned.length > 0 ? cleaned : text;
}

function EvidenceBullet({ line }: { line: string }) {
  const urls = extractHttpUrls(line);
  if (urls.length === 0) {
    return <li className="text-sm text-slate-300">{line}</li>;
  }
  const primary = urls[0];
  const rest = urls.slice(1);
  const text = stripUrlsFromText(line, urls);
  return (
    <li className="text-sm text-slate-300">
      <span>{text}</span>
      {primary ? (
        <>
          {" "}
          <a
            href={primary}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-semibold ${dt.accentText} ${dt.accentTextHover} underline-offset-2 hover:underline`}
          >
            Read source
          </a>
        </>
      ) : null}
      {rest.length > 0 ? (
        <details className="mt-1.5">
          <summary
            className={`cursor-pointer text-xs font-semibold ${dt.accentText} hover:underline`}
          >
            Sources
          </summary>
          <ul className="mt-1.5 space-y-1 pl-3">
            {rest.map((u, idx) => (
              <li key={`evidence-src-${idx}-${u.slice(0, 32)}`}>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs font-semibold ${dt.accentText} ${dt.accentTextHover} break-all hover:underline`}
                >
                  {u.length > 52 ? `${u.slice(0, 50)}…` : u}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

function LiveSkillDetailCard({
  skill,
  insetCard,
}: {
  skill: LiveSkillToPickUp;
  insetCard: string;
}) {
  const b = skill.scoringBreakdown;
  return (
    <NestedPanel className={insetCard}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${dt.textPrimary}`}>{skill.title}</p>
          <p className="mt-1 text-xs text-slate-400">{skill.category}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={dt.scoreChipAi}>AI-ranked priority</span>
          <span className={dt.secondaryChip}>
            {skill.priority} · {skill.priorityScore}/100
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-300">
        <span className="font-semibold text-slate-200">Why it matters:</span> {skill.whyItMatters}
      </p>
      <p className="mt-2 text-sm text-slate-300">
        <span className="font-semibold text-slate-200">Next move:</span> {skill.suggestedAction}
      </p>

      <details className={`mt-3 ${dt.detailsPanel}`}>
        <summary className={`cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:px-4`}>
          View details
        </summary>
        <DetailsPanel className="pt-0">
        <dl className="mt-1 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
          <div className={`${dt.detailsPanel} px-2 py-1.5`}>
            <dt className="text-slate-500">Market trends</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.marketTrendFrequency}/25</dd>
          </div>
          <div className={`${dt.detailsPanel} px-2 py-1.5`}>
            <dt className="text-slate-500">Signals</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.signalStrength}/20</dd>
          </div>
          <div className={`${dt.detailsPanel} px-2 py-1.5`}>
            <dt className="text-slate-500">Jobs</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.jobRelevance}/20</dd>
          </div>
          <div className={`${dt.detailsPanel} px-2 py-1.5`}>
            <dt className="text-slate-500">HRBP leverage</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.hrbpStrategicLeverage}/20</dd>
          </div>
          <div className={`${dt.detailsPanel} px-2 py-1.5`}>
            <dt className="text-slate-500">Portfolio</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.portfolioInterviewValue}/15</dd>
          </div>
        </dl>

        <p className={`mt-4 ${dt.labelCaps}`}>Evidence</p>
        <ul className="mt-1 list-none space-y-2 pl-0 text-sm text-slate-300">
          {cleanTextArray(skill.evidenceSignals, 12).map((x, idx) => (
            <EvidenceBullet key={`skill-ev-${idx}-${x.slice(0, 32)}`} line={x} />
          ))}
        </ul>

        <p className={`mt-4 ${dt.labelCaps}`}>Related topics</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {cleanTextArray(skill.relatedTopics, 16).map((t, idx) => (
            <span key={`skill-topic-${idx}-${t.slice(0, 32)}`} className={dt.secondaryChip}>
              {t}
            </span>
          ))}
        </div>
        </DetailsPanel>
      </details>
    </NestedPanel>
  );
}

function LiveLearningAssetPanel({
  asset,
  insetCard,
}: {
  asset: LiveLearningAsset;
  insetCard: string;
}) {
  const b = asset.scoringBreakdown;
  return (
    <article className={insetCard}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${dt.textPrimary}`}>{asset.title}</p>
          <p className="mt-1 text-xs text-slate-400">
            {asset.format} · {asset.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={dt.scoreChipAi}>AI-ranked priority</span>
          <span className={dt.secondaryChip}>
            {asset.priority} · {asset.priorityScore}/100
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-300">
        <span className="font-semibold text-slate-200">Why now:</span> {asset.whyNow}
      </p>
      <p className="mt-2 text-sm text-slate-300">
        <span className="font-semibold text-slate-200">Intended output:</span> {asset.intendedOutput}
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Linked skills</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {cleanTextArray(asset.linkedSkills, 12).map((s, idx) => (
          <span
            key={`asset-skill-${idx}-${s.slice(0, 32)}`}
            className={dt.skillTag}
          >
            {s}
          </span>
        ))}
      </div>

      <details className="mt-3 rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/40 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
          View details
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
          <div className="rounded border border-[color:var(--swift-border-subtle)] bg-slate-950/60 px-2 py-1.5">
            <dt className="text-slate-500">Linked skill</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.linkedSkillPriority}/30</dd>
          </div>
          <div className="rounded border border-[color:var(--swift-border-subtle)] bg-slate-950/60 px-2 py-1.5">
            <dt className="text-slate-500">Market demand</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.marketDemandEvidence}/20</dd>
          </div>
          <div className="rounded border border-[color:var(--swift-border-subtle)] bg-slate-950/60 px-2 py-1.5">
            <dt className="text-slate-500">Career reuse</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.reusableCareerValue}/20</dd>
          </div>
          <div className="rounded border border-[color:var(--swift-border-subtle)] bg-slate-950/60 px-2 py-1.5">
            <dt className="text-slate-500">Theory/practice</dt>
            <dd className="font-semibold text-slate-100">{b.theoryPracticeFoundation}/15</dd>
          </div>
          <div className="rounded border border-[color:var(--swift-border-subtle)] bg-slate-950/60 px-2 py-1.5">
            <dt className="text-slate-500">Output clarity</dt>
            <dd className={`font-semibold ${dt.textPrimary}`}>{b.outputClarity}/15</dd>
          </div>
        </dl>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Outline
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {cleanTextArray(asset.outline, 12).map((line, idx) => (
            <li key={`asset-outline-${idx}-${line.slice(0, 32)}`}>{line}</li>
          ))}
        </ul>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Source evidence
        </p>
        <ul className="mt-1 list-none space-y-2 pl-0 text-sm text-slate-300">
          {cleanTextArray(asset.sourceEvidence, 20).map((x, idx) => (
            <EvidenceBullet key={`asset-evidence-${idx}-${x.slice(0, 32)}`} line={x} />
          ))}
        </ul>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Theory / practice foundation
        </p>
        <div className="mt-2 space-y-2">
          {asset.theoryPracticeFoundation.map((f, fi) => (
            <div
              key={`${asset.id}-fw-${fi}`}
              className="rounded border border-[color:var(--swift-border-subtle)] bg-slate-950/60 px-3 py-2 text-sm text-slate-300"
            >
              <p className={`font-semibold ${dt.textPrimary}`}>
                {f.frameworkName}{" "}
                <span className="text-xs font-normal text-slate-500">({f.field})</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.howItSupportsTheAsset}</p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  type ReportPreview = {
    headline: string;
    executiveSummary: string;
    generatedAt: string | null;
    keySignals?: KeySignalPreview[];
  };
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);
  const [dashboardReport, setDashboardReport] = useState<DashboardReport | null>(null);
  const [previewSummaryOpen, setPreviewSummaryOpen] = useState(false);

  const [liveJobsPayload, setLiveJobsPayload] = useState<LiveJobIngestionResponse | null>(null);
  const [liveJobsLoading, setLiveJobsLoading] = useState(false);
  const [liveJobsError, setLiveJobsError] = useState<string | null>(null);
  const [linkedInRefreshRequested, setLinkedInRefreshRequested] = useState(false);

  type LinkedInImportedRow = {
    role: string;
    company: string;
    location?: string;
    fitScore?: number;
    applyUrl?: string;
    sourceUrl?: string;
    needsReview?: boolean;
  };
  const [importedLinkedInJobs, setImportedLinkedInJobs] = useState<LinkedInImportedRow[]>([]);
  const visibleImportedLinkedInJobs = useMemo(() => {
    const isPlaceholderUrl = (u: string | undefined) =>
      typeof u === "string" && /linkedin\.com\/jobs\/view\/1234567890/i.test(u);
    const isPlaceholderRow = (r: LinkedInImportedRow) =>
      r.role === LINKEDIN_PLACEHOLDER_ROLE ||
      r.company === LINKEDIN_PLACEHOLDER_COMPANY ||
      r.location === LINKEDIN_PLACEHOLDER_LOCATION;
    const isInvalidHref = (r: LinkedInImportedRow) => {
      const href = primaryJobHref(r);
      if (!href || href === "#") return true;
      if (isPlaceholderUrl(href)) return true;
      // Block any href that doesn't pass our apply-url validation.
      return !isRealJobApplyUrl(href);
    };
    return importedLinkedInJobs.filter((r) => {
      // Hide legacy placeholder-only rows; Gmail-derived LinkedIn jobs now show in Live opportunities.
      if (isPlaceholderRow(r)) return false;
      if (isPlaceholderUrl(r.applyUrl) || isPlaceholderUrl(r.sourceUrl)) return false;
      if (isInvalidHref(r)) return false;
      return true;
    });
  }, [importedLinkedInJobs]);

  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryResult | null>(null);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false);
  const [weeklySummaryFetchError, setWeeklySummaryFetchError] = useState<string | null>(null);

  const [skillsLearning, setSkillsLearning] = useState<LiveSkillsAndLearningResult | null>(null);
  const [skillsLearningLoading, setSkillsLearningLoading] = useState(false);

  const [manualSecretInput, setManualSecretInput] = useState("");
  const [manualSecretSaved, setManualSecretSaved] = useState(false);
  const [manualSending, setManualSending] = useState(false);
  const [manualPhase, setManualPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [manualGenerateError, setManualGenerateError] = useState<string | null>(null);
  const [lastRunDiagnostics, setLastRunDiagnostics] = useState<RunDiagnostics | null>(null);
  const [stableCountsNotice, setStableCountsNotice] = useState(false);
  const lastDiagnosticsFingerprintRef = useRef<string | null>(null);

  const activeSectionLabel = useMemo(() => {
    const item = navItems.find((n) => n.key === active);
    return item?.label ?? "SWIFT";
  }, [active, navItems]);

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

  useEffect(() => {
    // Client-only convenience: secret is never hardcoded in the app.
    void (async () => {
      try {
        const saved = localStorage.getItem("swift_manual_report_secret");
        setManualSecretSaved(Boolean(saved && saved.trim()));
      } catch {
        setManualSecretSaved(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (active !== "dashboard") return;
    let cancelled = false;
    void (async () => {
      setWeeklySummaryLoading(true);
      setWeeklySummaryFetchError(null);
      try {
        const res = await fetch("/api/debug/weekly-summary?days=7", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as WeeklySummaryResult;
        if (!cancelled) setWeeklySummary(d);
      } catch (e) {
        if (!cancelled) {
          setWeeklySummaryFetchError(e instanceof Error ? e.message : "Request failed");
          setWeeklySummary(null);
        }
      } finally {
        if (!cancelled) setWeeklySummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (active !== "skills" && active !== "learningAssets") return;
    let cancelled = false;
    void (async () => {
      setSkillsLearningLoading(true);
      try {
        const res = await fetch("/api/debug/skills-learning");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as LiveSkillsAndLearningResult;
        if (!cancelled) setSkillsLearning(d);
      } catch {
        if (!cancelled) setSkillsLearning(null);
      } finally {
        if (!cancelled) setSkillsLearningLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const loadJobsData = useCallback(async (forceLinkedInRefresh = false) => {
    setLiveJobsLoading(true);
    setLiveJobsError(null);
    try {
      const jobsUrl = forceLinkedInRefresh ? "/api/debug/jobs?linkedinRefresh=1" : "/api/debug/jobs";
      const [resJobs, resImported] = await Promise.all([
        fetch(jobsUrl, { cache: "no-store" }),
        fetch("/api/debug/imported-jobs"),
      ]);
      if (!resJobs.ok) throw new Error(`HTTP ${resJobs.status}`);
      const data = (await resJobs.json()) as LiveJobIngestionResponse;
      console.log("[jobs] payload", data);
      setLiveJobsPayload(data);
      if (resImported.ok) {
        const imp = (await resImported.json()) as { jobs?: Record<string, unknown>[] };
        const rows: LinkedInImportedRow[] = (imp.jobs ?? []).map((row) => {
          const r = row as Record<string, unknown>;
          const role = String(r.role ?? LINKEDIN_PLACEHOLDER_ROLE);
          const company = String(r.company ?? LINKEDIN_PLACEHOLDER_COMPANY);
          const location =
            typeof r.location === "string" && r.location.trim()
              ? r.location.trim()
              : LINKEDIN_PLACEHOLDER_LOCATION;
          const rawJson =
            r.raw_json && typeof r.raw_json === "object"
              ? (r.raw_json as Record<string, unknown>)
              : null;
          return {
            role,
            company,
            location,
            fitScore: typeof r.fit_score === "number" ? r.fit_score : undefined,
            applyUrl: typeof r.apply_url === "string" ? r.apply_url : undefined,
            sourceUrl: typeof r.source_url === "string" ? r.source_url : undefined,
            needsReview: isLinkedInImportIncomplete({
              role,
              company,
              location,
              raw_json: rawJson,
            }),
          };
        });
        setImportedLinkedInJobs(rows);
      } else {
        setImportedLinkedInJobs([]);
      }
      console.log("[jobs] normalized count", (data.opportunities ?? []).length);
    } catch (e) {
      setLiveJobsError(e instanceof Error ? e.message : "Failed to load live jobs");
      setImportedLinkedInJobs([]);
    } finally {
      setLiveJobsLoading(false);
      setLinkedInRefreshRequested(false);
    }
  }, []);

  useEffect(() => {
    if (active !== "jobOpportunities") return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadJobsData(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, loadJobsData]);

  const loadLatestReportPreview = useCallback(async () => {
    try {
      const latestRes = await fetch("/api/debug/latest-dashboard-report", { cache: "no-store" });
      if (!latestRes.ok) return;
      const d = (await latestRes.json()) as { reportJsonKeys?: string[] } & Record<string, unknown>;
      // This endpoint derives from the saved run; normalize from its payload if possible.
      const rep = normalizeDashboardReport(d);
      if (rep) {
        setDashboardReport(rep);
        const nextTs = new Date(rep.generatedAt).getTime();
        setLastRefreshedAt((prev) => {
          const prevTs = prev ? prev.getTime() : null;
          return prevTs === nextTs ? prev : new Date(nextTs);
        });
      } else {
        setDashboardReport(null);
      }

      const headline = typeof d.headline === "string" ? d.headline : "";
      const executiveSummary =
        typeof d.executive_summary === "string"
          ? d.executive_summary
          : typeof d.executiveSummary === "string"
            ? d.executiveSummary
            : "";
      const generatedAt = typeof d.generated_at === "string" ? d.generated_at : null;
      if (!headline && !executiveSummary) {
        setReportPreview(null);
        return;
      }
      setReportPreview({ headline, executiveSummary, generatedAt, keySignals: undefined });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (active !== "dashboard") return;
    const t = window.setTimeout(() => {
      void loadLatestReportPreview();
    }, 0);
    return () => window.clearTimeout(t);
  }, [active, loadLatestReportPreview]);

  const insetCard = `${dt.nestedPanel} p-4 sm:p-5`;
  const [strongSignalOpenIdx, setStrongSignalOpenIdx] = useState<number | null>(0);
  const liveJobWhyMap = useMemo(() => {
    const out = new Map<string, { whyThisFits?: string; source?: string; sourceUrl?: string }>();
    for (const o of liveJobsPayload?.opportunities ?? []) {
      const role = typeof o.role === "string" ? o.role.trim() : "";
      const company = typeof o.company === "string" ? o.company.trim() : "";
      if (!role || !company) continue;
      const key = `${role.toLowerCase()}|${company.toLowerCase()}`;
      out.set(key, {
        whyThisFits: typeof o.whyThisFits === "string" ? o.whyThisFits : undefined,
        source: typeof o.source === "string" ? o.source : undefined,
        sourceUrl: typeof o.sourceUrl === "string" ? o.sourceUrl : undefined,
      });
    }
    return out;
  }, [liveJobsPayload?.opportunities]);

  const lookupWhyThisFits = useCallback(
    (j: WeeklySummaryLiveJob) => {
      const role = (j.role ?? "").trim();
      const company = (j.company ?? "").trim();
      if (!role || !company) return undefined;
      const key = `${role.toLowerCase()}|${company.toLowerCase()}`;
      return liveJobWhyMap.get(key)?.whyThisFits;
    },
    [liveJobWhyMap],
  );

  type StrongSignalCard = {
    title: string;
    implication: string;
    source?: string;
    sourceUrl?: string;
    why?: string;
  };

  const strongSignalCards = useMemo((): StrongSignalCard[] => {
    const ks = reportPreview?.keySignals;
    if (ks && ks.length > 0) {
      return ks.slice(0, 3).map((s) => ({
        title: s.title,
        implication: s.implication,
        source: s.source,
        sourceUrl: s.sourceUrl,
      }));
    }
    return [
      {
        title: "Operating model",
        why: "AI work is moving from pilots to decision-right redesign.",
        implication:
          "Run a work decomposition workshop with leaders and define ownership and metrics.",
      },
      {
        title: "Hiring",
        why: "Role criticality is replacing broad headcount plans.",
        implication:
          "Build capability maps and challenge hiring requests with productivity alternatives.",
      },
      {
        title: "Risk posture",
        why: "Compliance requirements are shaping org structure earlier.",
        implication:
          "Partner with Legal and Compliance on workforce readiness and people risk controls.",
      },
    ];
  }, [reportPreview?.keySignals]);

  const weeklyLiveJobsStatCount = useMemo(() => {
    if (!weeklySummary) return 0;
    if (weeklySummary.liveJobsTotalDeduped > 0) return weeklySummary.liveJobsTotalDeduped;
    return weeklySummary.totalLiveJobs;
  }, [weeklySummary]);

  const web3AiBriefToShow = useMemo(() => {
    const rep = dashboardReport?.web3AiBrief;
    if (rep) {
      return {
        title: web3AiBrief.title,
        headline: rep.headline || web3AiBrief.headline,
        signals: rep.signals.length > 0 ? rep.signals : web3AiBrief.signals,
      };
    }
    return web3AiBrief;
  }, [dashboardReport]);

  const hrbpBriefToShow = useMemo(() => {
    const rep = dashboardReport?.hrbpBrief;
    if (rep) {
      return {
        title: hrbpBrief.title,
        headline: rep.headline || hrbpBrief.headline,
        signals: rep.signals.length > 0 ? rep.signals : hrbpBrief.signals,
      };
    }
    return hrbpBrief;
  }, [dashboardReport]);

  async function generateLatestReport() {
    console.info("[DASHBOARD] manual generate started");
    try {
      setManualSending(true);
      setManualPhase("loading");
      setManualGenerateError(null);
      setLastRunDiagnostics(null);
      setStableCountsNotice(false);

      const controller = new AbortController();
      const timeoutMs = 120_000;
      console.info("[DASHBOARD] manual generate timeout ms=" + timeoutMs);
      const timeout = window.setTimeout(() => {
        try {
          // Prefer a reason when supported; fallback to plain abort.
          controller.abort("timeout");
        } catch {
          controller.abort();
        }
      }, timeoutMs);

      let res: Response;
      try {
        res = await fetch("/api/generate-report", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }

      console.info("[DASHBOARD] manual generate response received status=" + res.status);
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        generatedAt?: string;
        report?: unknown;
        rawReport?: unknown;
        storage?: { saved?: boolean; error?: string; runId?: string };
      };

      if (!res.ok || body.ok === false) {
        throw new Error(body?.storage?.error || "Generate report request failed");
      }

      const nextReport = (body.report ?? body.rawReport) as unknown;
      const rep = normalizeDashboardReport({ report: nextReport });
      if (!rep) {
        throw new Error("Generate report returned an un-normalizable dashboard payload");
      }

      const generatedAt = rep.generatedAt;
      console.info("[DASHBOARD] manual generate report generatedAt=" + generatedAt);

      const storageSaved = Boolean(body.storage?.saved);
      console.info("[DASHBOARD] manual generate latest report saved saved=" + storageSaved);
      if (!storageSaved) {
        throw new Error(body.storage?.error || "Report generated but not saved");
      }

      setDashboardReport(rep);
      setLastRefreshedAt(new Date(rep.generatedAt));

      setManualPhase("success");
      console.info("[DASHBOARD] manual generate success generatedAt=" + rep.generatedAt);
    } catch (e) {
      const isAbort =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError") ||
        (e instanceof Error && /aborted/i.test(e.message));
      const msg = e instanceof Error ? e.message : "Generate failed";
      const friendly = isAbort
        ? "Generation timed out. The previous report is still shown. Please try again."
        : "Generation failed. The previous report is still shown. Please try again.";
      console.error("[DASHBOARD] manual generate failed reason=", msg);
      setManualGenerateError(friendly);
      setManualPhase("error");
    } finally {
      setManualSending(false);
    }
  }

  function resetManualSecret() {
    try {
      localStorage.removeItem("swift_manual_report_secret");
    } catch {
      // ignore
    }
    setManualSecretSaved(false);
    setManualSecretInput("");
    setManualPhase("idle");
    setLastRunDiagnostics(null);
    setStableCountsNotice(false);
    lastDiagnosticsFingerprintRef.current = null;
  }

  const manualButtonLabel =
    manualSending && manualPhase === "loading"
      ? "Generating intelligence report… this can take up to 2 minutes."
      : !manualSending && manualPhase === "success"
        ? "Latest report generated"
        : !manualSending && manualPhase === "error"
          ? manualGenerateError ?? "Generate failed — check server logs"
          : "Generate & Refresh Latest Report";

  const liveSkillsReady =
    skillsLearning?.status === "ok" &&
    skillsLearning.source === "repo_weekly_summary" &&
    skillsLearning.skills.length > 0;
  const liveAssetsReady =
    skillsLearning?.status === "ok" &&
    skillsLearning.source === "repo_weekly_summary" &&
    skillsLearning.learningAssets.length > 0;

  return (
    <main className={dt.pageBg}>
      <header className={dt.mobileHeader}>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`inline-flex items-center gap-2 rounded-lg ${dt.border} px-3 py-2 text-sm font-semibold ${dt.textPrimary} transition hover:border-[color:rgba(37,244,238,0.25)] hover:bg-[rgba(37,244,238,0.06)]`}
        >
          <svg
            className={`h-5 w-5 shrink-0 ${dt.accentText}`}
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
          <p className={`text-[10px] font-semibold tracking-[0.22em] ${dt.muted}`}>
            SWIFT
          </p>
          <p className={`truncate text-sm font-semibold ${dt.textPrimary}`}>
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
                subtitle="Market, roles, and people signals — refresh anytime; history compares week to week."
                right={
                  <div className="flex w-full max-w-md flex-col gap-3 md:w-auto md:max-w-[20rem] md:items-stretch">
                    <button
                      type="button"
                      onClick={() => void generateLatestReport()}
                      disabled={manualSending}
                      className={dt.primaryCta}
                    >
                      {manualButtonLabel}
                    </button>
                    {!manualSecretSaved ? (
                      <div
                        className={`${dt.cardRadius} ${dt.border} border-[color:var(--swift-border-subtle)] bg-[color:rgba(11,13,24,0.65)] p-3`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Manual send secret
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="password"
                            value={manualSecretInput}
                            onChange={(e) => setManualSecretInput(e.target.value)}
                            placeholder="Enter secret once"
                            autoComplete="off"
                            className={`${dt.cardRadius} w-full border border-[color:var(--swift-border-subtle)] bg-[color:rgba(5,5,7,0.55)] px-3 py-2 text-sm ${dt.textPrimary} placeholder:text-[color:var(--swift-text-secondary)]/50`}
                          />
                        </div>
                        <p className={`mt-2 text-xs ${dt.muted}`}>
                          Stored in this browser only (<code className="text-slate-400">swift_manual_report_secret</code>
                          ).
                        </p>
                      </div>
                    ) : null}
                    {manualSecretSaved ? (
                      <button
                        type="button"
                        onClick={resetManualSecret}
                        className={dt.resetMuted}
                      >
                        Reset secret
                      </button>
                    ) : null}
                  </div>
                }
              />

              {manualPhase === "success" && lastRunDiagnostics ? (
                <div
                  className={`${dt.cardRadius} ${dt.border} border-[color:var(--swift-border-subtle)] bg-[color:rgba(11,13,24,0.65)] px-4 py-3 sm:px-5`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Last run diagnostics
                  </p>
                  <p className={`mt-1 text-xs ${dt.muted}`}>
                    Ingestion ran before AI ({new Date(lastRunDiagnostics.ingestionCompletedAt).toLocaleString()}
                    ). Same pipeline as server manual send: RSS → jobs → LinkedIn imports → DeepSeek → Supabase →
                    email.
                  </p>
                  {stableCountsNotice ? (
                    <p className={`mt-2 text-xs font-medium text-amber-200/90`}>
                      Sources refreshed; no major new items found.
                    </p>
                  ) : null}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                    <div>
                      <dt className={dt.muted}>Generated</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>
                        {new Date(lastRunDiagnostics.generatedAt).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Run type</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>{lastRunDiagnostics.runType}</dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Raw signals</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>{lastRunDiagnostics.rawSignalCount}</dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Clean signals</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>{lastRunDiagnostics.cleanSignalCount}</dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Live jobs (ctx)</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>{lastRunDiagnostics.liveJobCount}</dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>LinkedIn imports</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>
                        {lastRunDiagnostics.importedLinkedInJobCount}
                      </dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Source health rows</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>
                        {lastRunDiagnostics.sourceHealthRowCount}
                      </dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Registry sources</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>
                        {typeof lastRunDiagnostics.registryEnabledSources === "number" &&
                        typeof lastRunDiagnostics.registryTotalSources === "number"
                          ? `${lastRunDiagnostics.registryEnabledSources} enabled / ${lastRunDiagnostics.registryTotalSources} total`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Email</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>{lastRunDiagnostics.emailStatus}</dd>
                    </div>
                    <div>
                      <dt className={dt.muted}>Run saved</dt>
                      <dd className={`font-medium ${dt.textPrimary}`}>
                        {lastRunDiagnostics.storageSaved ? "yes" : "no"}
                        {lastRunDiagnostics.runId ? ` · ${lastRunDiagnostics.runId.slice(0, 8)}…` : ""}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-2">
                <InfoCard
                  title={web3AiBriefToShow.title}
                  subtitle="Operator-facing Web3 × AI signals."
                  right={
                    manualSending && manualPhase === "loading" ? (
                      <Pill>Generating…</Pill>
                    ) : (
                      <Pill>Updated {formatDateTime(lastRefreshedAt)}</Pill>
                    )
                  }
                  className={dt.cardInsightExtra}
                >
                  <p className={`text-base font-semibold leading-snug ${dt.textPrimary}`}>
                    {web3AiBriefToShow.headline}
                  </p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
                    {cleanTextArray(web3AiBriefToShow.signals, 5).map((s, idx) => (
                      <li key={`web3ai-${idx}-${s.slice(0, 32)}`}>{s}</li>
                    ))}
                  </ul>
                  {dashboardReport?.web3AiBrief?.sources?.length ? (
                    <div className="mt-4">
                      <SourceDropdown sources={dashboardReport.web3AiBrief.sources} />
                    </div>
                  ) : null}
                </InfoCard>

                <InfoCard
                  title={hrbpBriefToShow.title}
                  subtitle="HRBP and people-leadership lens."
                  right={
                    manualSending && manualPhase === "loading" ? (
                      <Pill>Generating…</Pill>
                    ) : (
                      <Pill>Updated {formatDateTime(lastRefreshedAt)}</Pill>
                    )
                  }
                  className={dt.cardInsightExtra}
                >
                  <p className={`text-base font-semibold leading-snug ${dt.textPrimary}`}>
                    {hrbpBriefToShow.headline}
                  </p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
                    {cleanTextArray(hrbpBriefToShow.signals, 5).map((s, idx) => (
                      <li key={`hrbp-${idx}-${s.slice(0, 32)}`}>{s}</li>
                    ))}
                  </ul>
                  {dashboardReport?.hrbpBrief?.sources?.length ? (
                    <div className="mt-4">
                      <SourceDropdown sources={dashboardReport.hrbpBrief.sources} />
                    </div>
                  ) : (weeklySummary?.sourceExamples ?? []).length > 0 ? (
                    <div className="mt-4">
                      <SourceDropdown
                        sources={(weeklySummary?.sourceExamples ?? []).map((s) => ({
                          title: String(s.title ?? "Source"),
                          url: typeof s.url === "string" ? s.url : undefined,
                        }))}
                      />
                    </div>
                  ) : null}
                </InfoCard>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <InfoCard
                  title="Employment Law"
                  subtitle="Taxonomy-qualified signals — HRBP view only."
                  className={dt.cardAiModule}
                  right={
                    manualSending && manualPhase === "loading" ? (
                      <Pill>Generating…</Pill>
                    ) : dashboardReport?.employmentLaw?.status === "updated" &&
                        (dashboardReport?.employmentLaw?.items?.length ?? 0) > 0 ? (
                      <Pill tone="ai">Signals</Pill>
                    ) : dashboardReport?.employmentLaw?.status === "no_update" ? (
                      <Pill tone="neutral">No update</Pill>
                    ) : weeklySummaryLoading ? (
                      <Pill>Loading…</Pill>
                    ) : (weeklySummary?.employmentLawSignals?.length ?? 0) > 0 ? (
                      <Pill tone="ai">Signals</Pill>
                    ) : (
                      <Pill tone="neutral">No update</Pill>
                    )
                  }
                >
                  <p className={`text-xs leading-relaxed ${dt.muted}`}>
                    Not legal advice. Pure crypto or securities regulation is excluded unless workforce-linked.
                  </p>
                  {(() => {
                    const dashItems = dashboardReport?.employmentLaw?.items ?? [];
                    const wkItems = weeklySummary?.employmentLawSignals ?? [];
                    const sources =
                      dashItems.length > 0
                        ? dashItems.map((x, idx) => ({
                            title: safeVisibleTitle(String(x.title ?? ""), `Employment law signal ${idx + 1}`, 140),
                            publisher: typeof x.publisher === "string" ? x.publisher : undefined,
                            url: typeof x.url === "string" ? x.url : undefined,
                            date: typeof x.date === "string" ? x.date : undefined,
                          }))
                        : wkItems.map((s, idx) => ({
                            title: safeVisibleTitle(String(s.title ?? ""), `Employment law signal ${idx + 1}`, 140),
                            publisher:
                              typeof (s as unknown as { publisher?: unknown }).publisher === "string"
                                ? String((s as unknown as { publisher?: unknown }).publisher)
                                : undefined,
                            url: typeof s.url === "string" ? s.url : undefined,
                            date:
                              typeof (s as unknown as { date?: unknown }).date === "string"
                                ? String((s as unknown as { date?: unknown }).date)
                                : undefined,
                          }));

                    const headline =
                      dashboardReport?.employmentLaw?.headline?.trim() ||
                      dashboardReport?.employmentLaw?.summary?.trim() ||
                      "Employment law signals are filtered to HRBP-relevant workforce implications.";

                    const topSignals = cleanTextArray(
                      dashboardReport?.employmentLaw?.signals?.length
                        ? dashboardReport.employmentLaw.signals
                        : wkItems.map((x) => String(x.title ?? "")),
                      3,
                    );

                    if (sources.length === 0 && topSignals.length === 0) {
                      return (
                        <p className={`mt-4 text-sm ${dt.muted}`}>
                          No strong employment law update found in current run.
                        </p>
                      );
                    }

                    return (
                      <div className="mt-4 space-y-3">
                        <p className={`text-sm leading-relaxed ${dt.textPrimary} line-clamp-2`}>
                          {clampText(headline, 200)}
                        </p>
                        {topSignals.length > 0 ? (
                          <ul className={`list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300`}>
                            {topSignals.slice(0, 2).map((s, idx) => (
                              <li key={`law-top-${idx}-${s.slice(0, 24)}`} className="line-clamp-2">
                                {safeVisibleTitle(s, "Employment law signal", 160)}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {sources.length > 0 ? (
                          <SourceDropdown
                            sources={sources.map((s) => ({
                              title: s.title,
                              url: s.url,
                              publisher: s.publisher,
                              date: s.date,
                            }))}
                            label={`View sources (${sources.length})`}
                          />
                        ) : null}
                      </div>
                    );
                  })()}
                </InfoCard>

                <InfoCard
                  title="Expansion & Downsizing Trends"
                  subtitle="Taxonomy-qualified expansion, headcount, and restructuring — workforce planning."
                  className={dt.cardAiModule}
                  right={
                    manualSending && manualPhase === "loading" ? (
                      <Pill>Generating…</Pill>
                    ) : (dashboardReport?.expansionDownsizing &&
                        (dashboardReport.expansionDownsizing.expansionCount +
                          dashboardReport.expansionDownsizing.downsizingCount +
                          dashboardReport.expansionDownsizing.restructuringCount >
                          0)) ? (
                      <Pill tone="ai">Snapshot</Pill>
                    ) : dashboardReport?.expansionDownsizing?.status === "no_update" ? (
                      <Pill tone="neutral">Quiet</Pill>
                    ) : weeklySummaryLoading ? (
                      <Pill>Loading…</Pill>
                    ) : (weeklySummary?.expansionSignalCount ?? 0) +
                          (weeklySummary?.downsizingSignalCount ?? 0) +
                          (weeklySummary?.restructuringSignalCount ?? 0) >
                        0 ? (
                      <Pill tone="ai">Snapshot</Pill>
                    ) : (
                      <Pill tone="neutral">Quiet</Pill>
                    )
                  }
                >
                  <p className={`text-sm leading-relaxed ${dt.textPrimary}`}>
                    {dashboardReport?.expansionDownsizing?.peopleImplication?.trim() ||
                      weeklySummary?.expansionVsDownsizingTrend ||
                      "Run intelligence to populate expansion vs downsizing heuristics."}
                  </p>
                  {((dashboardReport?.expansionDownsizing &&
                    dashboardReport.expansionDownsizing.expansionCount +
                      dashboardReport.expansionDownsizing.downsizingCount +
                      dashboardReport.expansionDownsizing.restructuringCount ===
                      0) ||
                    (!dashboardReport?.expansionDownsizing &&
                      (weeklySummary?.expansionSignalCount ?? 0) +
                        (weeklySummary?.downsizingSignalCount ?? 0) +
                        (weeklySummary?.restructuringSignalCount ?? 0) ===
                        0)) ? (
                    <p className={`mt-3 text-sm ${dt.muted}`}>
                      No qualified workforce expansion or downsizing signal found in current run.
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className={dt.metricStatCard}>
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${dt.muted}`}>
                        Expansion
                      </p>
                      <p className={`mt-1 ${dt.metricValue}`}>
                        {dashboardReport?.expansionDownsizing?.expansionCount ??
                          weeklySummary?.expansionSignalCount ??
                          weeklySummary?.expansionSignals?.length ??
                          0}
                      </p>
                    </div>
                    <div className={dt.metricStatCard}>
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${dt.muted}`}>
                        Downsizing
                      </p>
                      <p className={`mt-1 ${dt.metricValue}`}>
                        {dashboardReport?.expansionDownsizing?.downsizingCount ??
                          weeklySummary?.downsizingSignalCount ??
                          weeklySummary?.downsizingSignals?.length ??
                          0}
                      </p>
                    </div>
                    <div className={dt.metricStatCard}>
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${dt.muted}`}>
                        Restructuring
                      </p>
                      <p className={`mt-1 ${dt.metricValue}`}>
                        {dashboardReport?.expansionDownsizing?.restructuringCount ??
                          weeklySummary?.restructuringSignalCount ??
                          weeklySummary?.restructuringSignals?.length ??
                          0}
                      </p>
                    </div>
                  </div>
                  {(weeklySummary?.expansionSignals?.[0] ||
                    weeklySummary?.downsizingSignals?.[0] ||
                    weeklySummary?.restructuringSignals?.[0]) && (
                    <div className={`mt-4 space-y-2 text-xs leading-relaxed ${dt.muted}`}>
                      {weeklySummary?.expansionSignals?.[0] ? (
                        <p>
                          <span className="font-semibold text-slate-400">Strongest expansion:</span>{" "}
                          <span className="text-slate-300">
                            {safeVisibleTitle(
                              String(weeklySummary.expansionSignals[0].title ?? ""),
                              "Workforce signal",
                              140,
                            )}
                          </span>
                        </p>
                      ) : null}
                      {weeklySummary?.downsizingSignals?.[0] || weeklySummary?.restructuringSignals?.[0] ? (
                        <p>
                          <span className="font-semibold text-slate-400">
                            Strongest downsizing / restructuring:
                          </span>{" "}
                          <span className="text-slate-300">
                            {safeVisibleTitle(
                              String(
                                weeklySummary?.downsizingSignals?.[0]?.title ??
                                  weeklySummary?.restructuringSignals?.[0]?.title ??
                                  "",
                              ),
                              "Workforce signal",
                              140,
                            )}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  )}
                  {(weeklySummary?.expansionPeopleImplication ||
                    weeklySummary?.expansionSuggestedHrbpLine) && (
                    <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
                      {weeklySummary?.expansionPeopleImplication ? (
                        <p>
                          <span className={`text-xs font-semibold uppercase tracking-wide ${dt.muted}`}>
                            People implication
                          </span>
                          <br />
                          {weeklySummary.expansionPeopleImplication}
                        </p>
                      ) : null}
                      {weeklySummary?.expansionSuggestedHrbpLine ? (
                        <p>
                          <span className={`text-xs font-semibold uppercase tracking-wide ${dt.muted}`}>
                            Suggested HRBP action
                          </span>
                          <br />
                          {weeklySummary.expansionSuggestedHrbpLine}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {(() => {
                    const src = [
                      ...(weeklySummary?.expansionSignals ?? []),
                      ...(weeklySummary?.downsizingSignals ?? []),
                      ...(weeklySummary?.restructuringSignals ?? []),
                    ]
                      .filter((s) => s && typeof s.title === "string" && s.title.trim())
                      .map((s) => ({
                        title: String(s.title ?? "Source"),
                        url: typeof s.url === "string" ? s.url : undefined,
                      }));
                    return src.length > 0 ? (
                      <div className="mt-4">
                        <SourceDropdown sources={src} label={`View sources (${src.length})`} />
                      </div>
                    ) : null;
                  })()}
                </InfoCard>
              </div>

              <InfoCard
                title="Weekly Intelligence Snapshot"
                subtitle="Signals, jobs, and themes — 7-day window."
                className={dt.cardAiModule}
                right={
                  weeklySummaryLoading ? (
                    <Pill>Loading…</Pill>
                  ) : weeklySummary?.storageConfigured && (weeklySummary.runCount ?? 0) > 0 ? (
                    <Pill tone="ai">Last 7 days</Pill>
                  ) : (
                    <Pill tone="warning">Awaiting data</Pill>
                  )
                }
              >
                {weeklySummaryLoading ? (
                  <div className={insetCard}>
                    <p className={`text-sm ${dt.muted}`}>Loading weekly snapshot…</p>
                  </div>
                ) : weeklySummaryFetchError ||
                  !weeklySummary ||
                  !weeklySummary.storageConfigured ||
                  weeklySummary.runCount === 0 ? (
                  <div className={insetCard}>
                    <p className={`text-sm leading-relaxed ${dt.muted}`}>
                      Run intelligence once to populate this snapshot.
                    </p>
                    {weeklySummaryFetchError ? (
                      <p className={`mt-2 text-xs ${dt.muted}`}>{weeklySummaryFetchError}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className={dt.metricStatCard}>
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${dt.muted}`}>
                          Runs this week
                        </p>
                        <p className={`mt-1 ${dt.metricValue}`}>{weeklySummary.runCount}</p>
                      </div>
                      <div className={dt.metricStatCard}>
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${dt.muted}`}>
                          Scheduled runs
                        </p>
                        <p className={`mt-1 ${dt.metricValue}`}>
                          {weeklySummary.scheduledRunCount}
                        </p>
                      </div>
                      <div className={dt.metricStatCard}>
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${dt.muted}`}>
                          Live jobs found
                        </p>
                        <p className={`mt-1 ${dt.metricValue}`}>{weeklyLiveJobsStatCount}</p>
                        {weeklyLiveJobsStatCount > 0 ? (
                          <details className="mt-2">
                            <summary
                              className={`cursor-pointer text-sm font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
                            >
                              {weeklyLiveJobsStatCount === 1
                                ? "View 1 live job"
                                : `View ${weeklyLiveJobsStatCount} live jobs`}
                            </summary>
                            <div className="mt-2 rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/40 p-3">
                              {(weeklySummary.liveJobs ?? []).length > 0 ? (
                                <LiveJobsDetailsList
                                  jobs={weeklySummary.liveJobs ?? []}
                                  hasMore={Boolean(weeklySummary.liveJobsHasMore)}
                                />
                              ) : (
                                <p className={`text-xs leading-relaxed ${dt.muted}`}>
                                  Count may include runs before job rows were stored.
                                </p>
                              )}
                            </div>
                          </details>
                        ) : (
                          <p className={`mt-3 text-xs leading-relaxed ${dt.muted}`}>
                            No live jobs found in this run.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className={insetCard}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Top themes
                        </p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                          {weeklySummary.topThemes.slice(0, 5).map((t, idx) => (
                            <li key={`theme-${idx}-${t.theme.slice(0, 32)}`}>
                              <span className="font-medium text-slate-200">{t.theme}</span>
                              <span className={`${dt.muted}`}> — {t.count}</span>
                            </li>
                          ))}
                        </ul>
                        {weeklySummary.topThemes.length === 0 ? (
                          <p className={`mt-2 text-xs ${dt.muted}`}>No themes in this window.</p>
                        ) : null}
                      </div>
                      <div className={insetCard}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Repeated companies
                        </p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                          {weeklySummary.repeatedCompanies.slice(0, 3).map((c, idx) => (
                            <li key={`repeatco-${idx}-${c.company.slice(0, 32)}`}>
                              <span className="font-medium text-slate-200">{c.company}</span>
                              <span className={`${dt.muted}`}> — {c.count}×</span>
                            </li>
                          ))}
                        </ul>
                        {weeklySummary.repeatedCompanies.length === 0 ? (
                          <p className={`mt-2 text-xs ${dt.muted}`}>No repeat employers yet.</p>
                        ) : null}
                      </div>
                    </div>
                    {(weeklySummary.sourceExamples ?? []).length > 0 ? (
                      <details className={insetCard}>
                        <summary
                          className={`cursor-pointer text-sm font-semibold ${dt.accentText} hover:underline`}
                        >
                          View source examples
                        </summary>
                        <ul className="mt-3 space-y-2 text-sm">
                          {(weeklySummary.sourceExamples ?? []).slice(0, 5).map((ex, idx) => (
                            <li key={`weekly-src-ex-${idx}-${String(ex.url ?? "").slice(0, 32)}`}>
                              <a
                                href={ex.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`font-medium ${dt.accentText} ${dt.accentTextHover} underline-offset-2 hover:underline`}
                              >
                                {ex.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <div className={insetCard}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Recommended learning focus
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                        {cleanTextArray(weeklySummary.recommendedLearningFocus.slice(0, 6), 3).map((line, idx) => (
                          <li key={`weekly-learn-${idx}-${line.slice(0, 32)}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <div className={insetCard}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Suggested next actions
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                        {cleanTextArray(weeklySummary.suggestedNextActions.slice(0, 6), 3).map((line, idx) => (
                          <li key={`weekly-action-${idx}-${line.slice(0, 32)}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </InfoCard>

              <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
                <InfoCard
                  title="Latest Preview"
                  subtitle="Last saved report output."
                  className={`${dt.cardAiModule} h-full`}
                >
                  <div className={`${insetCard} flex h-full min-h-0 flex-col`}>
                    {reportPreview ? (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Headline
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-snug text-slate-100">
                          {reportPreview.headline || "—"}
                        </p>
                        <p className={`mt-3 text-xs ${dt.muted}`}>
                          {reportPreview.generatedAt
                            ? `Generated ${new Date(reportPreview.generatedAt).toLocaleString()}`
                            : null}
                        </p>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Executive summary
                        </p>
                        <p
                          className={`mt-2 text-sm leading-relaxed text-slate-300 ${
                            previewSummaryOpen ? "max-h-56 overflow-auto pr-1" : "line-clamp-3"
                          }`}
                        >
                          {reportPreview.executiveSummary || "—"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPreviewSummaryOpen((o) => !o)}
                          className={`mt-2 text-left text-sm font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
                        >
                          {previewSummaryOpen ? "Hide summary" : "Show full summary"}
                        </button>
                        {reportPreview.keySignals && reportPreview.keySignals.length > 0 ? (
                          <details className="mt-4 rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/40 p-3">
                            <summary
                              className={`cursor-pointer text-sm font-semibold ${dt.accentText} hover:underline`}
                            >
                              Show key signals
                            </summary>
                            <ul className="mt-3 list-none space-y-3 pl-0 text-sm text-slate-300">
                              {reportPreview.keySignals.slice(0, 4).map((s, i) => (
                                <li key={`${s.title}-${i}`}>
                                  {s.sourceUrl ? (
                                    <a
                                      href={s.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`font-medium text-slate-100 ${dt.accentText} ${dt.accentTextHover} underline-offset-2 hover:underline`}
                                    >
                                      {s.title}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-slate-200">{s.title}</span>
                                  )}
                                  {s.source ? <span className={`${dt.muted}`}> · {s.source}</span> : null}
                                  {s.implication ? (
                                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                                      {s.implication}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </>
                    ) : (
                      <p className={`text-sm ${dt.muted}`}>No report generated yet.</p>
                    )}
                  </div>
                </InfoCard>

                <InfoCard
                  title="Strong Signals"
                  subtitle="Highest-conviction themes for HRBPs."
                  className={`${dt.cardAiModule} h-full`}
                  right={<Pill tone="accent">{strongSignalCards.length} strong</Pill>}
                >
                  <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
                    {strongSignalCards.map((item, idx) => {
                      const open = strongSignalOpenIdx === idx;
                      return (
                        <div key={`${item.title}-${idx}`} className={insetCard}>
                          <button
                            type="button"
                            onClick={() => setStrongSignalOpenIdx((cur) => (cur === idx ? null : idx))}
                            className="flex w-full items-start justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-semibold ${dt.textPrimary}`}>{item.title}</p>
                              <p className={`mt-1 text-xs ${dt.muted}`}>
                                {item.source ? item.source : "Evidence reviewed"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Pill tone="accent">Strong</Pill>
                              <span className={`${dt.muted}`}>
                                <Chevron open={open} />
                              </span>
                            </div>
                          </button>
                          <Collapsible open={open}>
                            <div className="pt-3">
                              {item.why ? (
                                <p className="text-sm text-slate-300">
                                  <span className="font-semibold text-slate-200">Why it matters:</span>{" "}
                                  {item.why}
                                </p>
                              ) : null}
                              <p className="mt-2 text-sm text-slate-300">
                                <span className="font-semibold text-slate-200">HRBP implication:</span>{" "}
                                {item.implication}
                              </p>
                              {item.sourceUrl ? (
                                <a
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`mt-3 inline-flex items-center gap-2 text-xs font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
                                >
                                  View source
                                </a>
                              ) : null}
                            </div>
                          </Collapsible>
                        </div>
                      );
                    })}
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
                  <p>
                    Live roles ranked for{" "}
                    <span className={`font-medium ${dt.textPrimary}`}>
                      {swiftPrimaryJobSearchProfile.name}
                    </span>
                    .
                  </p>
                }
                right={
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLinkedInRefreshRequested(true);
                        void loadJobsData(true);
                      }}
                      disabled={liveJobsLoading}
                      className={`rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      Refresh LinkedIn
                    </button>
                    {liveJobsLoading ? <Pill>Loading…</Pill> : null}
                    {(liveJobsPayload?.opportunities.length ?? 0) > 0 ? (
                      <Pill tone="success">Live</Pill>
                    ) : !liveJobsLoading ? (
                      <Pill tone="warning">Awaiting matches</Pill>
                    ) : null}
                  </div>
                }
              />

              {liveJobsPayload?.linkedInCache?.isRefreshing &&
              !liveJobsPayload?.linkedInCache?.hasCachedValue ? (
                <p className={`text-sm ${dt.muted}`}>Loading latest LinkedIn opportunities...</p>
              ) : null}
              {liveJobsPayload?.linkedInCache?.lastUpdatedAt ? (
                <p className={`text-xs ${dt.muted}`}>
                  Last updated at {new Date(liveJobsPayload.linkedInCache.lastUpdatedAt).toLocaleString()}
                  {liveJobsPayload.linkedInCache.isRefreshing ? " · Refreshing in background" : ""}
                  {linkedInRefreshRequested ? " · Manual refresh requested" : ""}
                </p>
              ) : null}

              <p className={`max-w-3xl text-sm leading-relaxed ${dt.muted}`}>
                Fit score reflects role relevance, industry match, target location, seniority and application
                quality (shown as{" "}
                <span className={`font-medium ${dt.textPrimary}`}>NN/100 fit</span>).
              </p>

              {liveJobsError ? (
                <p className={`text-sm ${dt.muted}`}>
                  Roles could not be loaded. Try again shortly.
                </p>
              ) : null}

              {!liveJobsLoading &&
              (liveJobsPayload?.opportunities.length ?? 0) === 0 &&
              liveJobsPayload ? (
                <div className={insetCard}>
                  <p className={`text-sm leading-relaxed ${dt.muted}`}>
                    No matches yet. Search tuning arrives in a later release.
                  </p>
                  <p className={`mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}>
                    Illustrative examples
                  </p>
                  <div className="mt-2 space-y-3 opacity-80">
                    {mockOpportunities.slice(0, 2).map((opp) => (
                      <div
                        key={`ex-${opp.company}-${opp.role}`}
                        className="rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/40 p-3"
                      >
                        <p className="text-sm font-semibold text-slate-100">{opp.role}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {opp.company} · {opp.location}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(liveJobsPayload?.opportunities.length ?? 0) > 0 ? (
                <InfoCard title="Live opportunities" subtitle="Ranked for fit — one tab per role.">
                  <div className="space-y-4">
                    {liveJobsPayload!.opportunities.map((opp) => {
                      const actionHref = isRealJobApplyUrl(opp.applyUrl)
                        ? opp.applyUrl
                        : opp.sourceUrl;
                      const isLinkedInListing =
                        opp.source === "LinkedIn Job Alert" ||
                        (typeof opp.applyUrl === "string" && opp.applyUrl.includes("linkedin.com"));
                      const actionLabel =
                        isLinkedInListing || !isRealJobApplyUrl(opp.applyUrl)
                          ? "View source"
                          : "Apply";
                      return (
                      <div key={opp.id} className={insetCard}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <a
                              href={actionHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`truncate text-sm font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
                            >
                              {opp.role}
                            </a>
                            <p className="mt-1 text-xs text-slate-400">
                              {opp.company} • {opp.location}
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                              Source: {opp.source} • {new Date(opp.dateFound).toLocaleString()}
                            </p>
                            {opp.needsLinkedInReview ? (
                              <p className="mt-1.5 text-xs leading-relaxed text-amber-200/90">
                                Open LinkedIn to verify role, employer and location before applying.
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                            {opp.needsLinkedInReview ? (
                              <Pill tone="warning">Needs Review</Pill>
                            ) : null}
                            <Pill className={dt.pillFit}>{opp.fitScore}/100 fit</Pill>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">{opp.whyThisFits}</p>
                        <div className="mt-4">
                          <a
                            href={actionHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center justify-center ${dt.cardRadius} ${
                              isLinkedInListing || !isRealJobApplyUrl(opp.applyUrl)
                                ? `${dt.applyButtonSecondary} transition`
                                : `${dt.applyButtonPrimary} transition`
                            } px-3 py-2 text-sm font-semibold`}
                          >
                            {actionLabel}
                          </a>
                        </div>
                        <details className="mt-4 rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/40 p-3">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
                            View details
                          </summary>
                          <div className="mt-3 space-y-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Gaps
                              </p>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                                {cleanTextArray(opp.gaps, 12).map((gap, idx) => (
                                  <li key={`opp-gap-${idx}-${gap.slice(0, 32)}`}>{gap}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Recommended action
                              </p>
                              <p className="mt-2 text-sm text-slate-300">{opp.recommendedAction}</p>
                            </div>
                          </div>
                        </details>
                      </div>
                      );
                    })}
                  </div>
                </InfoCard>
              ) : null}

              {visibleImportedLinkedInJobs.length > 0 ? (
                <InfoCard
                  title="LinkedIn Job Alerts"
                  subtitle="Imported from Hotmail / Outlook via Power Automate — SWIFT does not scrape LinkedIn."
                  className={dt.cardAiModule}
                  right={<Pill tone="ai">{visibleImportedLinkedInJobs.length} saved</Pill>}
                >
                  <div className="space-y-3">
                    <ul className="space-y-3">
                      {visibleImportedLinkedInJobs.slice(0, 5).map((row, idx) => {
                        const href = primaryJobHref(row);
                        return (
                          <li key={`${row.role}-${row.company}-${idx}`} className={insetCard}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-100">{row.role}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                  {row.company} · {row.location ?? "—"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">Source: LinkedIn Job Alert</p>
                                {row.needsReview ? (
                                  <p className="mt-1.5 text-xs leading-relaxed text-amber-200/90">
                                    Imported from LinkedIn alert; verify details in listing.
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                                {row.needsReview ? (
                                  <Pill tone="warning">Needs review</Pill>
                                ) : null}
                                <Pill className={dt.pillFit}>
                                  {typeof row.fitScore === "number" ? `${row.fitScore}/100` : "—"} fit
                                </Pill>
                              </div>
                            </div>
                            <div className="mt-3">
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center justify-center ${dt.cardRadius} ${dt.applyButtonSecondary} px-3 py-2 text-sm font-semibold transition`}
                              >
                                View source
                              </a>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {visibleImportedLinkedInJobs.length > 5 ? (
                      <details className="rounded-lg border border-[color:var(--swift-border-subtle)] bg-slate-950/35 p-3">
                        <summary
                          className={`cursor-pointer text-sm font-semibold ${dt.accentText} hover:underline`}
                        >
                          View all LinkedIn imports ({visibleImportedLinkedInJobs.length})
                        </summary>
                        <ul className="mt-3 max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-1">
                          {visibleImportedLinkedInJobs.slice(5).map((row, idx) => (
                            <li key={`li-more-${idx}`} className="text-sm">
                              <a
                                href={primaryJobHref(row)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`font-medium ${dt.accentText} hover:underline`}
                              >
                                {row.role} — {row.company}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </InfoCard>
              ) : null}
            </div>
          ) : null}

          {active === "skills" ? (
            <div className="space-y-6">
              <SectionHeader
                title="Skills to Pick Up"
                subtitle={
                  liveSkillsReady
                    ? "From your latest intelligence window and stored signals."
                    : "Examples until enough signal history exists."
                }
                right={
                  <div className="flex flex-wrap justify-end gap-2">
                    {skillsLearningLoading ? <Pill>Loading…</Pill> : null}
                    {liveSkillsReady ? (
                      <Pill tone="success">Live</Pill>
                    ) : (
                      <Pill tone="warning">Examples</Pill>
                    )}
                  </div>
                }
              />

              {liveSkillsReady ? (
                <InfoCard
                  title="Priority skills"
                  subtitle="Ranked using market themes, reports, signals, and job matches from your window."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {skillsLearning!.skills.map((skill) => (
                      <LiveSkillDetailCard key={skill.id} skill={skill} insetCard={insetCard} />
                    ))}
                  </div>
                </InfoCard>
              ) : (
                <InfoCard
                  title="Example skills"
                  subtitle="Shown when live priorities are not yet available."
                  right={<StatusBadge tone="warning">Examples</StatusBadge>}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {mockSkills.map((s) => (
                      <div key={s.id} className={insetCard}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-100">{s.skill}</p>
                          <StatusBadge tone={s.priority === "High" ? "strong" : "neutral"}>{s.priority}</StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{s.category}</p>
                        <p className="mt-3 text-sm text-slate-300">{s.evidence}</p>
                        <p className="mt-3 text-sm text-slate-300">
                          <span className="font-semibold text-slate-200">Next action:</span>{" "}
                          {s.nextAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </InfoCard>
              )}
            </div>
          ) : null}

          {active === "learningAssets" ? (
            <div className="space-y-6">
              <SectionHeader
                title="Learning Assets"
                subtitle={
                  liveAssetsReady
                    ? "Deliverables tied to your signals and curated frameworks."
                    : "Examples until enough signal history exists."
                }
                right={
                  <div className="flex flex-wrap justify-end gap-2">
                    {skillsLearningLoading ? <Pill>Loading…</Pill> : null}
                    {liveAssetsReady ? (
                      <Pill tone="success">Live</Pill>
                    ) : (
                      <Pill tone="warning">Examples</Pill>
                    )}
                  </div>
                }
              />

              {liveAssetsReady ? (
                <InfoCard
                  title="Learning assets"
                  subtitle="Practical deliverables tied to your top skill priorities."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {skillsLearning!.learningAssets.map((asset) => (
                      <LiveLearningAssetPanel key={asset.id} asset={asset} insetCard={insetCard} />
                    ))}
                  </div>
                </InfoCard>
              ) : (
                <InfoCard
                  title="Example learning assets"
                  subtitle="Shown when live recommendations are not yet available."
                  right={<StatusBadge tone="warning">Examples</StatusBadge>}
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    {mockLearningAssets.slice(0, 6).map((asset) => (
                      <LearningAssetCard key={asset.id} asset={asset} />
                    ))}
                  </div>
                </InfoCard>
              )}
            </div>
          ) : null}

          {active === "settings" ? (
            <div className="mx-auto w-full max-w-none space-y-10 md:space-y-12">
              <SectionHeader
                title="Settings"
                subtitle="How SWIFT works and where signals come from."
              />

              <AccordionSection
                title="Methodology"
                subtitle="How SWIFT turns signals into an executive HRBP intelligence loop."
                status={<Pill tone="ai">Live console</Pill>}
                defaultOpen
              >
                <div className="space-y-3">
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">What SWIFT does</p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      SWIFT turns Web3, AI and HR market signals into an executive-ready HRBP
                      intelligence loop: daily briefings, live job opportunities, skill priorities,
                      learning asset recommendations and weekly trend comparisons.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">Purpose</p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      Designed for a senior HRBP / People operator who needs to track market
                      shifts, identify role opportunities, prioritise capability building and
                      convert signals into practical people strategy outputs.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">Signal sources</p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      SWIFT draws from a curated registry across Web3, AI, HR and hiring: industry
                      feeds, public job boards, official blogs and newsletters, with room to add
                      authenticated channels over time.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">
                      Employment law & workforce signals
                    </p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      Employment Law and Expansion / Downsizing views combine keyword scans on
                      ingested RSS text with your Supabase history. They surface HRBP implications
                      only — not legal advice. Weekly snapshots compare runs, themes, source
                      coverage and LinkedIn alert imports.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">LinkedIn connection model</p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      LinkedIn is connected through Hotmail / Outlook job alert email and Microsoft
                      Power Automate posting to a protected SWIFT endpoint — SWIFT does not scrape
                      LinkedIn pages or automate browser sessions.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">
                      On-demand and scheduled intelligence
                    </p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      You can refresh intelligence when you need it; scheduled runs can deliver
                      summaries by email. Each run is saved so you can compare what changed across
                      weeks and months.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">Decision logic</p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      Skills and learning priorities reflect market themes, signal strength, how
                      roles line up with your focus areas, strategic leverage for HRBP work, and
                      practical interview and portfolio value.
                    </p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-sm font-semibold text-slate-100">Saved history</p>
                    <p className={`mt-2 text-sm ${dt.muted}`}>
                      Runs, signals and opportunities are stored so SWIFT can show movement over
                      time—not only a single-day snapshot.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Curated sources",
                      "Executive reports",
                      "Role matching",
                      "Weekly trends",
                      "Saved history",
                    ].map((x, idx) => (
                      <Pill key={`about-pill-${idx}-${x.slice(0, 32)}`}>{x}</Pill>
                    ))}
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Job Application Channels"
                subtitle="Channels you use to discover and apply to roles."
                defaultOpen
              >
                <div className={`mb-4 ${insetCard}`}>
                  <p className="text-sm font-semibold text-slate-100">LinkedIn Job Alerts</p>
                  <ul className={`mt-2 list-disc space-y-1.5 pl-5 text-sm ${dt.muted}`}>
                    <li>Status: Connected via Hotmail / Outlook job alert ingestion</li>
                    <li>Source: LinkedIn saved searches (job alert emails)</li>
                    <li>Ingestion: Microsoft Power Automate → POST /api/job-alert-ingest (Bearer secret)</li>
                    <li>Note: SWIFT does not scrape LinkedIn pages.</li>
                  </ul>
                  <p className={`mt-3 text-xs leading-relaxed ${dt.muted}`}>
                    Use Power Automate: Outlook new email trigger → filter LinkedIn job alerts →
                    HTTP POST to the SWIFT job-alert-ingest endpoint with JSON body{" "}
                    <code className="text-slate-400">{`{ "source": "linkedin_job_alert_outlook", "messages": [...] }`}</code>
                    .
                  </p>
                </div>
                <InfoCard title="Saved channels" subtitle="Open each link in a new tab.">
                  <div className={`overflow-x-auto ${dt.cardRadius} ${dt.border}`}>
                    <table className="min-w-[640px] w-full text-left text-sm md:min-w-0">
                      <thead className={`${dt.cardInset} text-[11px] uppercase tracking-wide text-slate-400`}>
                        <tr>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-4 py-3 font-semibold">Enabled</th>
                          <th className="px-4 py-3 font-semibold">Tier</th>
                          <th className="px-4 py-3 font-semibold">Last checked</th>
                          <th className="px-4 py-3 font-semibold">Link</th>
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
                                rel="noopener noreferrer"
                                className={`text-sm font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
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
              </AccordionSection>

              <AccordionSection
                title="Suggested New Channel(s)"
                subtitle="Ideas to expand where you hear about roles and market moves."
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
                          rel="noopener noreferrer"
                          className={`text-sm font-semibold ${dt.accentText} ${dt.accentTextHover} hover:underline`}
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection
                title="Source Registry"
                subtitle="Curated feeds and listings SWIFT can use, grouped by topic."
                status={
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>{sourceRegistrySummary.total} total</Pill>
                    <Pill tone="success">{sourceRegistrySummary.enabled} enabled</Pill>
                    <Pill>{sourceRegistrySummary.rssEnabled} syndicated</Pill>
                  </div>
                }
                defaultOpen
              >
                <p className={`text-sm ${dt.muted}`}>
                  Counts reflect the current registry. Expand a topic to open each source in a new
                  tab.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Total sources
                    </p>
                    <p className={`mt-1 ${dt.metricValueLg}`}>{sourceRegistrySummary.total}</p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Enabled
                    </p>
                    <p className={`mt-1 ${dt.metricValueLg}`}>{sourceRegistrySummary.enabled}</p>
                  </div>
                  <div className={insetCard}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Syndicated feeds on
                    </p>
                    <p className={`mt-1 ${dt.metricValueLg}`}>{sourceRegistrySummary.rssEnabled}</p>
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
                <div className="mt-6 space-y-3">
                  {sourceRegistrySummary.grouped.map(({ topic, sources }) => {
                    const label = SOURCE_TOPIC_LABEL[topic] ?? topic;
                    return (
                      <details
                        key={topic}
                        className={`${dt.cardRadius} ${dt.border} ${dt.cardInset}`}
                      >
                        <summary
                          className={`cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-100 marker:hidden [&::-webkit-details-marker]:hidden`}
                        >
                          {label}
                          <span className={`ml-2 font-normal ${dt.muted}`}>({sources.length})</span>
                        </summary>
                        <ul className="space-y-3 border-t border-[color:var(--swift-border-subtle)] px-4 py-4">
                          {sources.map((s) => (
                            <li key={s.id} className="text-sm">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`min-w-0 font-semibold ${dt.accentText} ${dt.accentTextHover} underline-offset-2 hover:underline`}
                                >
                                  {s.name}
                                </a>
                                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                  <Pill>{s.sourceType}</Pill>
                                  {s.enabled ? (
                                    <Pill tone="success">On</Pill>
                                  ) : (
                                    <Pill tone="warning">Off</Pill>
                                  )}
                                </div>
                              </div>
                              {s.notes ? (
                                <p className={`mt-2 text-xs leading-relaxed ${dt.muted}`}>{s.notes}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              </AccordionSection>
            </div>
          ) : null}

        </div>
      </div>
    </main>
  );
}
