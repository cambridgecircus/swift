"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import InfoCard from "@/components/InfoCard";
import LearningAssetCard from "@/components/LearningAssetCard";
import { DetailsPanel, NestedPanel, StatusBadge } from "@/components/DashboardPrimitives";
import type { NavItem, NavKey } from "@/components/Sidebar";
import Sidebar from "@/components/Sidebar";
import SectionHeader from "@/components/SectionHeader";
import { mockLearningAssets, mockOpportunities, mockSkills } from "@/lib/mockData";
import { jobApplicationChannels, suggestedNewChannels } from "@/lib/jobSourceMemory";
import { designTokens as dt } from "@/lib/designTokens";
import { isRealJobApplyUrl } from "@/lib/jobApplyUrl";
import { swiftPrimaryJobSearchProfile } from "@/lib/jobSearchProfiles";
import type { LiveJobIngestionResponse } from "@/lib/jobIngestion";
import { sourceRegistry } from "@/lib/sourceRegistry";
import {
  type WeeklySummaryLiveJob,
  type WeeklySummaryResult,
} from "@/lib/intelligenceStorage";
import {
  isLinkedInImportIncomplete,
  LINKEDIN_PLACEHOLDER_COMPANY,
  LINKEDIN_PLACEHOLDER_LOCATION,
  LINKEDIN_PLACEHOLDER_ROLE,
} from "@/lib/linkedinJobAlertIngestion";
import type { RunDiagnostics } from "@/lib/runDiagnostics";
import type { LiveLearningAsset, LiveSkillToPickUp, LiveSkillsAndLearningResult } from "@/lib/skillsAndLearning";
import { normalizeDashboardReport, type DashboardReport } from "@/lib/dashboardReportMapper";
import type { GeoAiDailyBrief, GeoAiDailyBriefDebug } from "@/lib/geoAiDailyBrief";

type DashboardBrief = {
  title: string;
  headline: string;
  signals: string[];
};

type GeoBriefResponse = {
  ok?: boolean;
  report?: GeoAiDailyBrief | null;
  empty?: boolean;
  error?: string;
  message?: string;
  storage?: { saved?: boolean; error?: string };
  debug?: GeoAiDailyBriefDebug;
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

function GeoBriefDebugBox({ debug }: { debug: GeoAiDailyBriefDebug | null }) {
  if (!debug) return null;
  const rows: Array<[string, string]> = [
    ["Authenticated Gmail", debug.authenticatedGmailAccount || "Unknown"],
    ["Expected Gmail", debug.expectedGmailAccount],
    ["Account matched", debug.accountMatched ? "Yes" : "No"],
    ["Configured GMAIL_USER", debug.configuredGmailUser || "Not set"],
    ["CareerIntel/Market label", debug.careerIntelMarketLabelExists ? "Found" : "Missing"],
    ["CareerIntel/Market label ID", debug.careerIntelMarketLabelId || "Not found"],
    ["Label search results", String(debug.labelSearchMessagesFound)],
    ["Fallback search results", String(debug.fallbackSearchMessagesFound)],
    ["Successful query", debug.successfulGmailQuery || "None yet"],
    ["Latest alert subject", debug.latestGoogleAlertSubject || "None"],
    ["Latest alert timestamp", debug.latestGoogleAlertTimestamp || "None"],
    ["Article links extracted", String(debug.articleLinksExtracted)],
    ["Article links fetched", String(debug.articleLinksFetched)],
  ];

  return (
    <div className={`${dt.cardRadius} ${dt.border} bg-slate-950/45 p-4`}>
      <p className={`text-sm font-semibold ${dt.textPrimary}`}>Gmail debug</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md border border-slate-800/70 bg-slate-950/35 p-3">
            <dt className="font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
      {debug.fetchErrors.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-950/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-100/80">
            Fetch errors / blocked pages
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-100/80">
            {debug.fetchErrors.slice(0, 6).map((error, idx) => (
              <li key={`geo-debug-error-${idx}-${error.slice(0, 16)}`}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {debug.error ? (
        <p className="mt-3 text-xs leading-relaxed text-amber-100/85">{debug.error}</p>
      ) : null}
    </div>
  );
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
  type GmailIntelDiagnostics = {
    status?: string;
    rawItemCount?: number;
    curatedKeepCount?: number;
    itemsSentToAI?: number;
    signalsCount?: number;
    qualifiedSignalCount?: number;
  };
  type LatestReportStatus = {
    storageConfigured: boolean;
    hasLatestRun: boolean;
    triageUsed: boolean;
    gmailIntelDiagnostics: GmailIntelDiagnostics | null;
  };
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);
  const [dashboardReport, setDashboardReport] = useState<DashboardReport | null>(null);
  const [latestReportStatus, setLatestReportStatus] = useState<LatestReportStatus | null>(null);
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

  const [manualSending, setManualSending] = useState(false);
  const [manualPhase, setManualPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [manualGenerateError, setManualGenerateError] = useState<string | null>(null);
  const [lastRunDiagnostics, setLastRunDiagnostics] = useState<RunDiagnostics | null>(null);
  const [stableCountsNotice, setStableCountsNotice] = useState(false);
  const [geoBrief, setGeoBrief] = useState<GeoAiDailyBrief | null>(null);
  const [geoBriefLoading, setGeoBriefLoading] = useState(false);
  const [geoBriefRefreshing, setGeoBriefRefreshing] = useState(false);
  const [geoBriefError, setGeoBriefError] = useState<string | null>(null);
  const [geoBriefNotice, setGeoBriefNotice] = useState<string | null>(null);
  const [geoBriefEmpty, setGeoBriefEmpty] = useState(false);
  const [geoBriefDebug, setGeoBriefDebug] = useState<GeoAiDailyBriefDebug | null>(null);

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

  const loadGeoBrief = useCallback(async () => {
    setGeoBriefLoading(true);
    setGeoBriefError(null);
    setGeoBriefNotice(null);
    try {
      const res = await fetch("/api/generate-report", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as GeoBriefResponse;
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      setGeoBrief(body.report ?? null);
      setGeoBriefEmpty(Boolean(body.empty || !body.report));
      setGeoBriefDebug(body.debug ?? body.report?.gmailDebug ?? null);
      if (body.message) setGeoBriefNotice(body.message);
      if (body.report?.lastUpdatedAt || body.report?.generatedAt) {
        setLastRefreshedAt(new Date(body.report.lastUpdatedAt || body.report.generatedAt));
      }
    } catch (e) {
      setGeoBrief(null);
      setGeoBriefEmpty(false);
      setGeoBriefError(e instanceof Error ? e.message : "Latest GEO x AI brief could not be loaded.");
    } finally {
      setGeoBriefLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active !== "dashboard") return;
    const t = window.setTimeout(() => {
      void loadGeoBrief();
    }, 0);
    return () => window.clearTimeout(t);
  }, [active, loadGeoBrief]);

  async function refreshGeoBrief() {
    setGeoBriefRefreshing(true);
    setGeoBriefError(null);
    setGeoBriefNotice(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as GeoBriefResponse;
      if (!res.ok || body.ok === false) {
        setGeoBriefDebug(body.debug ?? body.report?.gmailDebug ?? null);
        throw new Error(body.error || body.storage?.error || `HTTP ${res.status}`);
      }
      setGeoBrief(body.report ?? null);
      setGeoBriefEmpty(Boolean(body.empty || !body.report));
      setGeoBriefDebug(body.debug ?? body.report?.gmailDebug ?? null);
      if (body.message) {
        setGeoBriefNotice(body.message);
      } else if (body.report?.email?.sent) {
        setGeoBriefNotice("Brief refreshed, Dashboard updated, and digest email sent.");
      } else if (body.report?.email?.error) {
        setGeoBriefNotice(`Brief refreshed, but email delivery needs attention: ${body.report.email.error}`);
      } else if (body.report) {
        setGeoBriefNotice("Brief refreshed and Dashboard updated.");
      }
      if (body.report?.lastUpdatedAt || body.report?.generatedAt) {
        setLastRefreshedAt(new Date(body.report.lastUpdatedAt || body.report.generatedAt));
      }
    } catch (e) {
      setGeoBriefError(e instanceof Error ? e.message : "GEO x AI brief refresh failed.");
    } finally {
      setGeoBriefRefreshing(false);
    }
  }

  const loadLatestReportPreview = useCallback(async () => {
    try {
      const latestRes = await fetch("/api/debug/latest-dashboard-report", { cache: "no-store" });
      if (!latestRes.ok) return;
      const d = (await latestRes.json()) as {
        reportJsonKeys?: string[];
        storageConfigured?: boolean;
        hasLatestRun?: boolean;
        triageUsed?: boolean;
        gmailIntelDiagnostics?: GmailIntelDiagnostics | null;
      } & Record<string, unknown>;
      setLatestReportStatus({
        storageConfigured: d.storageConfigured === true,
        hasLatestRun: d.hasLatestRun === true,
        triageUsed: d.triageUsed === true,
        gmailIntelDiagnostics:
          d.gmailIntelDiagnostics && typeof d.gmailIntelDiagnostics === "object"
            ? d.gmailIntelDiagnostics
            : null,
      });
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
        signals: rep.signals.length > 0 ? rep.signals : [],
      };
    }
    return {
      title: web3AiBrief.title,
      headline: "No live SWIFT Intel run is loaded.",
      signals: [
        "SWIFT expects Gmail SWIFT Intel to be ingested, triaged by AI, saved, then displayed here.",
        "This view has no saved live run available, so real-time signals are not being shown.",
      ],
    };
  }, [dashboardReport]);

  const hrbpBriefToShow = useMemo(() => {
    const rep = dashboardReport?.hrbpBrief;
    if (rep) {
      return {
        title: hrbpBrief.title,
        headline: rep.headline || hrbpBrief.headline,
        signals: rep.signals.length > 0 ? rep.signals : [],
      };
    }
    return {
      title: hrbpBrief.title,
      headline: "No AI-triaged HRBP brief is loaded.",
      signals: [
        "Run generation in an environment with Gmail, AI, and storage configured to populate this card.",
        "Until a saved run exists, this dashboard should not be treated as live intelligence.",
      ],
    };
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
        triageUsed?: boolean;
        gmailIntelDiagnostics?: GmailIntelDiagnostics | null;
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
      setLatestReportStatus({
        storageConfigured: true,
        hasLatestRun: true,
        triageUsed: body.triageUsed === true,
        gmailIntelDiagnostics:
          body.gmailIntelDiagnostics && typeof body.gmailIntelDiagnostics === "object"
            ? body.gmailIntelDiagnostics
            : null,
      });

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
            <div className="space-y-6 md:space-y-8">
              <SectionHeader
                title="GEO x AI Daily Brief"
                subtitle="Executive brief from CareerIntel/Market Google Alerts."
                right={
                  <div className="flex w-full max-w-md flex-col gap-2 md:w-auto md:max-w-[18rem] md:items-stretch">
                    <button
                      type="button"
                      onClick={() => void refreshGeoBrief()}
                      disabled={geoBriefRefreshing}
                      className={dt.primaryCta}
                    >
                      {geoBriefRefreshing ? "Refreshing brief..." : "Refresh brief"}
                    </button>
                    <p className={`text-xs ${dt.muted}`}>
                      Last updated: {formatDateTime(lastRefreshedAt)}
                    </p>
                  </div>
                }
              />

              {geoBriefNotice ? (
                <div
                  className={`${dt.cardRadius} ${dt.border} border-emerald-400/20 bg-emerald-950/20 p-4`}
                >
                  <p className="text-sm leading-relaxed text-emerald-100">{geoBriefNotice}</p>
                </div>
              ) : null}

              <GeoBriefDebugBox debug={geoBriefDebug} />

              {geoBriefLoading ? (
                <div className={`${dt.cardRadius} ${dt.border} bg-[rgba(11,13,24,0.72)] p-5`}>
                  <p className={`text-sm font-semibold ${dt.textPrimary}`}>Loading brief</p>
                  <p className={`mt-2 text-sm leading-relaxed ${dt.muted}`}>
                    Checking the latest saved GEO x AI analysis.
                  </p>
                </div>
              ) : geoBriefError ? (
                <div
                  className={`${dt.cardRadius} ${dt.border} border-amber-400/25 bg-amber-950/20 p-5`}
                >
                  <p className="text-sm font-semibold text-amber-100">Brief unavailable</p>
                  <p className="mt-2 text-sm leading-relaxed text-amber-100/80">{geoBriefError}</p>
                </div>
              ) : geoBriefEmpty || !geoBrief ? (
                <div className={`${dt.cardRadius} ${dt.border} bg-[rgba(11,13,24,0.72)] p-5`}>
                  <p className={`text-sm font-semibold ${dt.textPrimary}`}>No brief yet</p>
                  <p className={`mt-2 text-sm leading-relaxed ${dt.muted}`}>
                    No Google Alert found in the latest window. Refresh again after the
                    CareerIntel/Market Google Alert arrives.
                  </p>
                </div>
              ) : (
                <InfoCard
                  title="Latest analysed report"
                  subtitle={`${geoBrief.diagnostics.gmailMessagesFound} Gmail message${geoBrief.diagnostics.gmailMessagesFound === 1 ? "" : "s"} found · ${geoBrief.diagnostics.googleAlertMessagesProcessed} Google Alert${geoBrief.diagnostics.googleAlertMessagesProcessed === 1 ? "" : "s"} processed · ${geoBrief.diagnostics.articlesFetched}/${geoBrief.diagnostics.linksExtracted} articles fetched`}
                  right={<Pill tone="ai">{formatDateTime(new Date(geoBrief.lastUpdatedAt || geoBrief.generatedAt))}</Pill>}
                  className={dt.cardAiModule}
                >
                  <div className="space-y-6">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Executive signal
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {geoBrief.executiveSignal || geoBrief.executiveSummary}
                      </p>
                    </div>

                    {geoBrief.oneLineSummary ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          One-line summary
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">
                          {geoBrief.oneLineSummary}
                        </p>
                      </div>
                    ) : null}

                    {geoBrief.topSignals.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Top signals
                        </p>
                        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
                          {geoBrief.topSignals.map((item, idx) => (
                            <li key={`geo-signal-${idx}-${item.slice(0, 24)}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        What happened today
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {geoBrief.whatHappenedToday || geoBrief.marketMovement}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        GTM / Sales implication
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {geoBrief.gtmSalesImplication || geoBrief.geoAiSearchAdsImplications}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Why it matters for Semrush / Adobe
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {geoBrief.whyItMattersForSemrushAdobe || geoBrief.semrushAdobeRelevance}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        HRBP implication
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {geoBrief.hrbpImplication || geoBrief.hrbpOrgHiringRelevance}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Recommended action
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {geoBrief.recommendedAction}
                      </p>
                    </div>

                    {geoBrief.warnings.length > 0 ? (
                      <div>
                        <ul className="space-y-2 rounded-lg border border-amber-400/20 bg-amber-950/20 p-4 text-sm leading-relaxed text-amber-100/85">
                          {geoBrief.warnings.map((item, idx) => (
                            <li key={`geo-warning-${idx}-${item.slice(0, 24)}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {geoBrief.sourceLinks.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Source links
                        </p>
                        <ul className="mt-3 space-y-3">
                          {geoBrief.sourceLinks.map((source, idx) => (
                            <li
                              key={`geo-source-${idx}-${source.url}`}
                              className="rounded-lg border border-slate-800/80 bg-slate-950/35 p-4"
                            >
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold text-cyan-100 hover:text-cyan-200"
                              >
                                {source.title}
                              </a>
                              <p className={`mt-1 text-xs ${dt.muted}`}>
                                {source.publication} ·{" "}
                                {source.contentFetched ? "article fetched" : "content unavailable"}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                                {source.shortSummary}
                              </p>
                              <p className="mt-2 text-xs leading-relaxed text-emerald-100/75">
                                {source.relevanceReason}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </InfoCard>
              )}
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
