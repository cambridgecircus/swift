import {
  buildExpansionVsDownsizingTrend,
  countKeywordThemesInRows,
  extractExcludedDownsizingCandidates,
  extractExcludedExpansionCandidates,
  extractDownsizingSnippets,
  extractEmploymentLawSnippets,
  extractExpansionSnippets,
  extractRestructuringSnippets,
  type ExcludedCandidate,
} from "@/lib/swiftKeywordIntel";
import {
  LINKEDIN_PLACEHOLDER_COMPANY,
  LINKEDIN_PLACEHOLDER_LOCATION,
  LINKEDIN_PLACEHOLDER_ROLE,
  isLinkedInImportIncomplete,
  recomputeLinkedInImportFitScore,
  type StoredImportedJobAlert,
} from "@/lib/linkedinJobAlertIngestion";
import { getSupabaseAdmin, isSupabaseStorageConfigured } from "@/lib/supabaseServer";

export type SaveIntelligenceRunInput = {
  runType: "manual" | "scheduled" | "debug";
  report: Record<string, unknown>;
  marketSignals?: Record<string, unknown>[];
  jobOpportunities?: Record<string, unknown>[];
  sourceHealth?: Record<string, unknown>[];
  sourceRegistrySummary?: Record<string, unknown>;
  rawSignalCount?: number;
  cleanSignalCount?: number;
  emailStatus?: string;
  emailMessageId?: string;
};

export type SaveIntelligenceRunResult = {
  saved: boolean;
  runId?: string;
  error?: string;
};

function pickField(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const x = o[k];
    if (typeof x === "string" && x.trim()) return x.trim();
  }
  return "";
}

function pickInt(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const x = o[k];
    if (typeof x === "number" && !Number.isNaN(x)) return x;
    if (typeof x === "string") {
      const n = parseInt(x, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function toMarketSignalRow(runId: string, s: Record<string, unknown>) {
  const publishedRaw = pickField(s, ["publishedAt", "published_at"]);
  let publishedAt: string | null = null;
  if (publishedRaw) {
    const d = new Date(publishedRaw);
    if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
  }
  return {
    run_id: runId,
    title: pickField(s, ["title", "Title"]) || "Untitled",
    source_name: pickField(s, ["sourceName", "source_name"]) || null,
    source_url: pickField(s, ["url", "sourceUrl", "source_url"]) || null,
    category: pickField(s, ["category", "Category"]) || null,
    published_at: publishedAt,
    relevance_score: pickInt(s, ["relevanceScore", "relevance_score"]),
    signal_strength: pickField(s, ["signalStrength", "signal_strength"]) || null,
    summary: pickField(s, ["summary", "Summary"]) || null,
    why_it_matters: pickField(s, ["whyItMatters", "why_it_matters"]) || null,
    hrbp_implication: pickField(s, ["hrbpImplication", "hrbp_implication"]) || null,
  };
}

function toJobRow(runId: string, j: Record<string, unknown>) {
  const dateRaw = pickField(j, ["dateFound", "date_found"]);
  let dateFound: string | null = null;
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) dateFound = d.toISOString();
  }
  const gapsVal = j.gaps ?? j.Gaps;
  let gapsJson: unknown[] = [];
  if (Array.isArray(gapsVal)) gapsJson = gapsVal as unknown[];
  else if (typeof gapsVal === "string") {
    try {
      const p = JSON.parse(gapsVal) as unknown;
      if (Array.isArray(p)) gapsJson = p;
    } catch {
      gapsJson = [gapsVal];
    }
  }

  return {
    run_id: runId,
    role: pickField(j, ["role", "Role"]) || "Unknown role",
    company: pickField(j, ["company", "Company"]) || null,
    location: pickField(j, ["location", "Location"]) || null,
    source: pickField(j, ["source", "Source"]) || null,
    source_url: pickField(j, ["sourceUrl", "source_url"]) || null,
    apply_url: pickField(j, ["applyUrl", "apply_url"]) || null,
    date_found: dateFound,
    fit_score: pickInt(j, ["fitScore", "fit_score"]),
    why_this_fits: pickField(j, ["whyThisFits", "why_this_fits"]) || null,
    gaps: gapsJson,
    recommended_action: pickField(j, ["recommendedAction", "recommended_action"]) || null,
    status: pickField(j, ["status", "Status"]) || null,
  };
}

function toSourceHealthRow(runId: string, h: Record<string, unknown>) {
  const checkedRaw = pickField(h, ["checkedAt", "checked_at"]);
  let checkedAt: string | null = null;
  if (checkedRaw) {
    const d = new Date(checkedRaw);
    if (!Number.isNaN(d.getTime())) checkedAt = d.toISOString();
  }
  return {
    run_id: runId,
    source_name: pickField(h, ["sourceName", "source_name"]) || "unknown",
    status: pickField(h, ["status", "Status"]) || null,
    item_count: pickInt(h, ["itemCount", "item_count"]) ?? 0,
    error_message: pickField(h, ["errorMessage", "error_message"]) || null,
    checked_at: checkedAt,
  };
}

export async function saveIntelligenceRun(
  input: SaveIntelligenceRunInput,
): Promise<SaveIntelligenceRunResult> {
  if (!isSupabaseStorageConfigured()) {
    return { saved: false, error: "Supabase not configured" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { saved: false, error: "Supabase not configured" };
  }

  const report = input.report ?? {};
  const generatedAtRaw = typeof report.generatedAt === "string" ? report.generatedAt : null;
  const generatedAt =
    generatedAtRaw && !Number.isNaN(new Date(generatedAtRaw).getTime())
      ? new Date(generatedAtRaw).toISOString()
      : new Date().toISOString();

  const headline = typeof report.headline === "string" ? report.headline : "";
  const executiveSummary =
    typeof report.executiveSummary === "string" ? report.executiveSummary : "";

  const rawSignalCount = input.rawSignalCount ?? 0;
  const cleanSignalCount = input.cleanSignalCount ?? 0;
  const liveJobCount = input.jobOpportunities?.length ?? 0;

  const runRow = {
    run_type: input.runType,
    generated_at: generatedAt,
    headline,
    executive_summary: executiveSummary,
    report_json: report,
    raw_signal_count: rawSignalCount,
    clean_signal_count: cleanSignalCount,
    live_job_count: liveJobCount,
    email_status: input.emailStatus ?? null,
    email_message_id: input.emailMessageId ?? null,
  };

  try {
    const { data: inserted, error: runErr } = await supabase
      .from("swift_runs")
      .insert(runRow)
      .select("id")
      .maybeSingle();

    if (runErr) {
      return { saved: false, error: runErr.message };
    }
    const runId = inserted?.id as string | undefined;
    if (!runId) {
      return { saved: false, error: "Insert did not return run id" };
    }

    const signals = (input.marketSignals ?? []).map((s) => toMarketSignalRow(runId, s));
    if (signals.length) {
      const { error: sigErr } = await supabase.from("swift_market_signals").insert(signals);
      if (sigErr) {
        return { saved: true, runId, error: `Run saved; market signals failed: ${sigErr.message}` };
      }
    }

    const jobs = (input.jobOpportunities ?? []).map((j) => toJobRow(runId, j));
    if (jobs.length) {
      const { error: jobErr } = await supabase.from("swift_job_opportunities").insert(jobs);
      if (jobErr) {
        return { saved: true, runId, error: `Run saved; jobs failed: ${jobErr.message}` };
      }
    }

    const health = (input.sourceHealth ?? []).map((h) => toSourceHealthRow(runId, h));
    if (health.length) {
      const { error: hErr } = await supabase.from("swift_source_health").insert(health);
      if (hErr) {
        return { saved: true, runId, error: `Run saved; source health failed: ${hErr.message}` };
      }
    }

    if (input.sourceRegistrySummary && typeof input.sourceRegistrySummary === "object") {
      const s = input.sourceRegistrySummary as Record<string, unknown>;
      const snapshotRow = {
        run_id: runId,
        total_sources: typeof s.totalSources === "number" ? s.totalSources : null,
        enabled_sources: typeof s.enabledSources === "number" ? s.enabledSources : null,
        rss_enabled: typeof s.rssEnabled === "number" ? s.rssEnabled : null,
        api_planned: typeof s.apiPlanned === "number" ? s.apiPlanned : null,
        json_planned: typeof s.jsonPlanned === "number" ? s.jsonPlanned : null,
        manual_planned: typeof s.manualPlanned === "number" ? s.manualPlanned : null,
        by_topic: (s.byTopic as unknown) ?? null,
        by_type: (s.byType as unknown) ?? null,
        enabled_source_names: (s.enabledSourceNames as unknown) ?? null,
        disabled_source_names: (s.disabledSourceNames as unknown) ?? null,
        snapshot_json: s,
      };
      // Best-effort insert: never block report generation/email on snapshot failure.
      try {
        await supabase.from("swift_source_registry_snapshots").insert(snapshotRow);
      } catch {
        // ignore
      }
    }

    return { saved: true, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { saved: false, error: msg };
  }
}

export async function getLatestRuns(limit = 10): Promise<{ runs: Record<string, unknown>[]; error?: string }> {
  if (!isSupabaseStorageConfigured()) {
    return { runs: [], error: "Supabase not configured" };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return { runs: [], error: "Supabase not configured" };

  try {
    const { data, error } = await supabase
      .from("swift_runs")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));

    if (error) return { runs: [], error: error.message };
    return { runs: (data ?? []) as Record<string, unknown>[] };
  } catch (e) {
    return { runs: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function getRunById(runId: string): Promise<{
  run: Record<string, unknown> | null;
  marketSignals: Record<string, unknown>[];
  jobOpportunities: Record<string, unknown>[];
  sourceHealth: Record<string, unknown>[];
  sourceRegistrySnapshot: Record<string, unknown> | null;
  error?: string;
}> {
  if (!isSupabaseStorageConfigured()) {
    return {
      run: null,
      marketSignals: [],
      jobOpportunities: [],
      sourceHealth: [],
      sourceRegistrySnapshot: null,
      error: "Supabase not configured",
    };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      run: null,
      marketSignals: [],
      jobOpportunities: [],
      sourceHealth: [],
      sourceRegistrySnapshot: null,
      error: "Supabase not configured",
    };
  }

  try {
    const { data: run, error: runErr } = await supabase
      .from("swift_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (runErr) {
      return {
        run: null,
        marketSignals: [],
        jobOpportunities: [],
        sourceHealth: [],
        sourceRegistrySnapshot: null,
        error: runErr.message,
      };
    }
    if (!run) {
      return {
        run: null,
        marketSignals: [],
        jobOpportunities: [],
        sourceHealth: [],
        sourceRegistrySnapshot: null,
        error: "Not found",
      };
    }

    const [sigRes, jobRes, healthRes, snapshotRes] = await Promise.all([
      supabase.from("swift_market_signals").select("*").eq("run_id", runId),
      supabase.from("swift_job_opportunities").select("*").eq("run_id", runId),
      supabase.from("swift_source_health").select("*").eq("run_id", runId),
      supabase
        .from("swift_source_registry_snapshots")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      run: run as Record<string, unknown>,
      marketSignals: (sigRes.data ?? []) as Record<string, unknown>[],
      jobOpportunities: (jobRes.data ?? []) as Record<string, unknown>[],
      sourceHealth: (healthRes.data ?? []) as Record<string, unknown>[],
      sourceRegistrySnapshot: (snapshotRes.data ?? null) as Record<string, unknown> | null,
      error:
        sigRes.error?.message ??
        jobRes.error?.message ??
        healthRes.error?.message ??
        snapshotRes.error?.message,
    };
  } catch (e) {
    return {
      run: null,
      marketSignals: [],
      jobOpportunities: [],
      sourceHealth: [],
      sourceRegistrySnapshot: null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export type WeeklyThemeCount = { theme: string; count: number };
export type WeeklyCompanyCount = { company: string; count: number };
export type WeeklySourceCount = { source: string; count: number };

/** Job row shape for weekly summary and dashboard (camelCase). */
export type WeeklySummaryLiveJob = {
  role: string;
  company: string;
  location?: string;
  source?: string;
  applyUrl?: string;
  sourceUrl?: string;
  fitScore?: number;
  /** LinkedIn email imports with placeholder metadata need human verification. */
  needsLinkedInReview?: boolean;
};

export function mapDbJobRowToWeeklyLiveJob(j: Record<string, unknown>): WeeklySummaryLiveJob {
  return {
    role: typeof j.role === "string" ? j.role : "",
    company: typeof j.company === "string" ? j.company : "",
    location: typeof j.location === "string" ? j.location : undefined,
    source: typeof j.source === "string" ? j.source : undefined,
    applyUrl: typeof j.apply_url === "string" ? j.apply_url : undefined,
    sourceUrl: typeof j.source_url === "string" ? j.source_url : undefined,
    fitScore: typeof j.fit_score === "number" ? j.fit_score : undefined,
  };
}

/** Map stored / ingested job object (camelCase keys) to WeeklySummaryLiveJob. */
export function mapCtxJobRecordToWeeklyLiveJob(j: Record<string, unknown>): WeeklySummaryLiveJob {
  return {
    role: typeof j.role === "string" ? j.role : "",
    company: typeof j.company === "string" ? j.company : "",
    location: typeof j.location === "string" ? j.location : undefined,
    source: typeof j.source === "string" ? j.source : undefined,
    applyUrl: typeof j.applyUrl === "string" ? j.applyUrl : undefined,
    sourceUrl: typeof j.sourceUrl === "string" ? j.sourceUrl : undefined,
    fitScore: typeof j.fitScore === "number" ? j.fitScore : undefined,
  };
}

export function mapImportedAlertDbRowToWeeklyLiveJob(j: Record<string, unknown>): WeeklySummaryLiveJob {
  const role =
    typeof j.role === "string" && j.role.trim() ? j.role.trim() : LINKEDIN_PLACEHOLDER_ROLE;
  const company =
    typeof j.company === "string" && j.company.trim() ? j.company.trim() : LINKEDIN_PLACEHOLDER_COMPANY;
  const location =
    typeof j.location === "string" && j.location.trim()
      ? j.location.trim()
      : LINKEDIN_PLACEHOLDER_LOCATION;
  const apply =
    typeof j.apply_url === "string"
      ? j.apply_url
      : typeof j.applyUrl === "string"
        ? j.applyUrl
        : undefined;
  const srcUrl =
    typeof j.source_url === "string"
      ? j.source_url
      : typeof j.sourceUrl === "string"
        ? j.sourceUrl
        : undefined;
  const rawJson =
    j.raw_json && typeof j.raw_json === "object" ? (j.raw_json as Record<string, unknown>) : null;
  const alertRow: StoredImportedJobAlert = {
    id: String(j.id ?? ""),
    source: typeof j.source === "string" ? j.source : "",
    role,
    company,
    location,
    apply_url: typeof j.apply_url === "string" ? j.apply_url : null,
    source_url: typeof j.source_url === "string" ? j.source_url : null,
    fit_score: typeof j.fit_score === "number" ? j.fit_score : null,
    status: typeof j.status === "string" ? j.status : null,
    created_at: typeof j.created_at === "string" ? j.created_at : undefined,
    email_subject: typeof j.email_subject === "string" ? j.email_subject : null,
    raw_json: rawJson,
  };
  const fitScore = recomputeLinkedInImportFitScore(alertRow);
  const needsLinkedInReview = isLinkedInImportIncomplete({
    role,
    company,
    location,
    raw_json: rawJson,
  });
  return {
    role,
    company,
    location,
    source: "LinkedIn Job Alert",
    applyUrl: apply,
    sourceUrl: srcUrl ?? apply,
    fitScore: fitScore,
    needsLinkedInReview,
  };
}

const LIVE_JOBS_LIST_CAP = 20;

/** Dedupe by role + company + applyUrl + sourceUrl; keep best fitScore. Newest-first tiebreaker not needed for v1. */
export function dedupeAndSortLiveJobs(mapped: WeeklySummaryLiveJob[]): WeeklySummaryLiveJob[] {
  const dedupe = new Map<string, WeeklySummaryLiveJob>();
  for (const j of mapped) {
    if (!j.role.trim()) continue;
    const key = `${j.role.trim().toLowerCase()}|${(j.company ?? "").trim().toLowerCase()}|${(j.applyUrl ?? "").trim()}|${(j.sourceUrl ?? "").trim()}`;
    const prev = dedupe.get(key);
    if (!prev || (j.fitScore ?? 0) > (prev.fitScore ?? 0)) dedupe.set(key, j);
  }
  return [...dedupe.values()].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
}

/** Sample market rows with URLs for executive UI (weekly snapshot). */
export type WeeklySourceExample = { title: string; url: string };

export function buildCappedWeeklyLiveJobsList(mapped: WeeklySummaryLiveJob[]): {
  liveJobs: WeeklySummaryLiveJob[];
  liveJobsTotalDeduped: number;
  liveJobsHasMore: boolean;
} {
  const sorted = dedupeAndSortLiveJobs(mapped);
  return {
    liveJobs: sorted.slice(0, LIVE_JOBS_LIST_CAP),
    liveJobsTotalDeduped: sorted.length,
    liveJobsHasMore: sorted.length > LIVE_JOBS_LIST_CAP,
  };
}

export type WeeklyIntelSnippet = {
  title: string;
  summary: string;
  url?: string;
  jurisdiction?: string;
  lawTheme?: string;
  confidence?: "high" | "medium" | "low";
  signalType?: "expansion" | "downsizing" | "restructuring" | "mixed";
  whyItQualifies?: string;
  hrbpImplication?: string;
  suggestedAction?: string;
  sourceName?: string;
};

export type WeeklySummaryResult = {
  status: "ok" | "error";
  storageConfigured: boolean;
  periodDays: number;
  runCount: number;
  manualRunCount: number;
  scheduledRunCount: number;
  totalRawSignals: number;
  totalCleanSignals: number;
  totalLiveJobs: number;
  importedLinkedInJobCount: number;
  employmentLawSignals: WeeklyIntelSnippet[];
  employmentLawSignalCount: number;
  employmentLawJurisdictions: string[];
  employmentLawThemes: string[];
  expansionSignals: WeeklyIntelSnippet[];
  downsizingSignals: WeeklyIntelSnippet[];
  restructuringSignals: WeeklyIntelSnippet[];
  expansionSignalCount: number;
  downsizingSignalCount: number;
  restructuringSignalCount: number;
  excludedExpansionCandidates?: ExcludedCandidate[];
  excludedDownsizingCandidates?: ExcludedCandidate[];
  expansionVsDownsizingTrend: string;
  expansionPeopleImplication?: string;
  expansionSuggestedHrbpLine?: string;
  classificationNotes?: string;
  recommendedEmploymentLawFocus: string[];
  recommendedOrgPlanningFocus: string[];
  /** Deduped job rows in the period (capped list + counts). */
  liveJobs: WeeklySummaryLiveJob[];
  liveJobsTotalDeduped: number;
  liveJobsHasMore: boolean;
  /** Up to 5 recent market signal rows with source URLs (deduped by URL). */
  sourceExamples: WeeklySourceExample[];
  repeatedCompanies: WeeklyCompanyCount[];
  topSources: WeeklySourceCount[];
  topThemes: WeeklyThemeCount[];
  recommendedLearningFocus: string[];
  suggestedNextActions: string[];
  latestRuns: Record<string, unknown>[];
  sourceRegistry?: {
    latestTotalSources: number;
    latestEnabledSources: number;
    latestRssEnabled: number;
    latestPlannedBreakdown: { api: number; json: number; manual: number };
    enabledSourcesTrend: {
      generatedAt: string;
      enabledSources: number;
      totalSources: number;
      rssEnabled: number;
    }[];
    sourceMixByType: Record<string, number>;
    sourceMixByTopic: Record<string, number>;
  };
  error?: string;
};

const THEME_SCANNERS: { theme: string; pattern: RegExp }[] = [
  { theme: "AI", pattern: /\b(ai|artificial intelligence)\b/gi },
  { theme: "Web3", pattern: /\bweb3\b/gi },
  { theme: "crypto", pattern: /\bcrypto\b/gi },
  { theme: "blockchain", pattern: /\bblockchain\b/gi },
  { theme: "compliance", pattern: /\bcompliance\b/gi },
  { theme: "regulation", pattern: /\bregulation\b/gi },
  { theme: "employment law", pattern: /\bemployment law\b/gi },
  { theme: "restructuring", pattern: /\brestructuring\b/gi },
  { theme: "expansion", pattern: /\bexpansion\b/gi },
  { theme: "layoffs", pattern: /\blayoffs?\b/gi },
  { theme: "entity setup", pattern: /\bentity setup\b/gi },
  { theme: "cost reduction", pattern: /\bcost reduction\b/gi },
  { theme: "talent", pattern: /\btalent\b/gi },
  { theme: "hiring", pattern: /\bhiring\b/gi },
  { theme: "leadership", pattern: /\bleadership\b/gi },
  { theme: "analytics", pattern: /\banalytics\b/gi },
  { theme: "workforce planning", pattern: /\bworkforce planning\b/gi },
  { theme: "reward", pattern: /\breward\b/gi },
  { theme: "skills", pattern: /\bskills?\b/gi },
  { theme: "operating model", pattern: /\boperating model\b/gi },
];

function normSource(s: string): string {
  return s.trim().toLowerCase() || "unknown";
}

function extractReportText(report: unknown): string {
  if (!report || typeof report !== "object") return "";
  const r = report as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.headline === "string") parts.push(r.headline);
  if (typeof r.executiveSummary === "string") parts.push(r.executiveSummary);
  const ks = r.keySignals;
  if (Array.isArray(ks)) {
    for (const item of ks) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        for (const k of ["title", "source", "implication", "sourceName"]) {
          if (typeof o[k] === "string") parts.push(o[k] as string);
        }
      }
    }
  }
  const hr = r.hrbpRecommendations;
  if (Array.isArray(hr)) {
    for (const x of hr) {
      if (typeof x === "string") parts.push(x);
    }
  }
  return parts.join(" \n ");
}

function countThemesInText(blob: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { theme, pattern } of THEME_SCANNERS) {
    const matches = blob.match(pattern);
    const n = matches ? matches.length : 0;
    if (n > 0) counts.set(theme, n);
  }
  return counts;
}

function mergeThemeCounts(into: Map<string, number>, from: Map<string, number>) {
  for (const [k, v] of from) {
    into.set(k, (into.get(k) ?? 0) + v);
  }
}

function deriveLearningFocus(themeCounts: Map<string, number>, topThemes: WeeklyThemeCount[]): string[] {
  const out: string[] = [];
  const max = topThemes[0]?.count ?? 0;
  const thr = Math.max(2, Math.ceil(max * 0.35));
  const score = (t: string) => themeCounts.get(t) ?? 0;

  if (score("compliance") + score("regulation") >= thr || score("compliance") + score("regulation") >= 3) {
    out.push("Compliance-ready HRBP operating model");
  }
  if (score("AI") >= thr || score("AI") >= 3) {
    out.push("AI literacy and workflow redesign for HRBPs");
  }
  if (score("analytics") >= thr || score("analytics") >= 3) {
    out.push("People analytics into executive decision-making");
  }
  if (score("hiring") + score("talent") >= thr || score("hiring") + score("talent") >= 4) {
    out.push("Strategic workforce planning for Web3 growth");
  }
  if (out.length === 0) {
    out.push("Cross-cutting HRBP operator literacy (signals, narrative, and exec-ready outputs)");
  }
  return out;
}

const DEFAULT_NEXT_ACTIONS = [
  "Review live jobs with the highest fit score and shortlist two to pursue or delegate.",
  "Update Learning Assets priorities based on the top themes from this period.",
  "Compare source quality across runs and consider disabling persistently low-signal sources.",
  "Prepare one reusable interview story grounded in the strongest recurring theme.",
];

function buildSuggestedWeeklyActions(input: {
  employmentLawHitCount: number;
  expansionSnippetCount: number;
  downsizingSnippetCount: number;
  linkedinImportCount: number;
}): string[] {
  const extra: string[] = [];
  if (input.employmentLawHitCount > 0) {
    extra.push("Review potential impact on policy, manager guidance and ER risk.");
  }
  if (input.expansionSnippetCount > input.downsizingSnippetCount && input.expansionSnippetCount > 0) {
    extra.push("Prepare workforce planning, org design and leadership readiness questions.");
  }
  if (input.downsizingSnippetCount > input.expansionSnippetCount && input.downsizingSnippetCount > 0) {
    extra.push("Prepare change, ER risk and productivity impact narratives.");
  }
  if (input.linkedinImportCount > 0) {
    extra.push("Review LinkedIn Job Alert imports and shortlist the highest-fit roles.");
  }
  return [...extra, ...DEFAULT_NEXT_ACTIONS].filter((x, i, a) => a.indexOf(x) === i).slice(0, 8);
}

/**
 * Deterministic weekly-style summary from stored runs (no LLM). Uses swift_runs and related tables.
 *
 * TODO(monthly-summary): When `getMonthlySummary` exists, reuse `WeeklyIntelSnippet`, `intelligenceTaxonomy`
 * classifiers, `employmentLawSignalCount` / `expansionSignalCount` / `restructuringSignalCount`, and the same
 * `recommendedEmploymentLawFocus` / `recommendedOrgPlanningFocus` fields for a 28–31 day window.
 */
export async function getWeeklySummary(days = 7): Promise<WeeklySummaryResult> {
  const storageConfigured = isSupabaseStorageConfigured();
  const periodDays = Math.min(90, Math.max(1, Math.floor(days)));

  if (!storageConfigured) {
    return {
      status: "error",
      storageConfigured: false,
      periodDays,
      runCount: 0,
      manualRunCount: 0,
      scheduledRunCount: 0,
      totalRawSignals: 0,
      totalCleanSignals: 0,
      totalLiveJobs: 0,
      importedLinkedInJobCount: 0,
      employmentLawSignals: [],
      employmentLawSignalCount: 0,
      employmentLawJurisdictions: [],
      employmentLawThemes: [],
      expansionSignals: [],
      downsizingSignals: [],
      restructuringSignals: [],
      expansionSignalCount: 0,
      downsizingSignalCount: 0,
      restructuringSignalCount: 0,
      excludedExpansionCandidates: [],
      excludedDownsizingCandidates: [],
      expansionVsDownsizingTrend: "",
      expansionPeopleImplication: undefined,
      expansionSuggestedHrbpLine: undefined,
      classificationNotes: undefined,
      recommendedEmploymentLawFocus: [],
      recommendedOrgPlanningFocus: [],
      liveJobs: [],
      liveJobsTotalDeduped: 0,
      liveJobsHasMore: false,
      sourceExamples: [],
      repeatedCompanies: [],
      topSources: [],
      topThemes: [],
      recommendedLearningFocus: [],
      suggestedNextActions: DEFAULT_NEXT_ACTIONS,
      latestRuns: [],
      error: "Supabase not configured",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      status: "error",
      storageConfigured: false,
      periodDays,
      runCount: 0,
      manualRunCount: 0,
      scheduledRunCount: 0,
      totalRawSignals: 0,
      totalCleanSignals: 0,
      totalLiveJobs: 0,
      importedLinkedInJobCount: 0,
      employmentLawSignals: [],
      employmentLawSignalCount: 0,
      employmentLawJurisdictions: [],
      employmentLawThemes: [],
      expansionSignals: [],
      downsizingSignals: [],
      restructuringSignals: [],
      expansionSignalCount: 0,
      downsizingSignalCount: 0,
      restructuringSignalCount: 0,
      excludedExpansionCandidates: [],
      excludedDownsizingCandidates: [],
      expansionVsDownsizingTrend: "",
      expansionPeopleImplication: undefined,
      expansionSuggestedHrbpLine: undefined,
      classificationNotes: undefined,
      recommendedEmploymentLawFocus: [],
      recommendedOrgPlanningFocus: [],
      liveJobs: [],
      liveJobsTotalDeduped: 0,
      liveJobsHasMore: false,
      sourceExamples: [],
      repeatedCompanies: [],
      topSources: [],
      topThemes: [],
      recommendedLearningFocus: [],
      suggestedNextActions: DEFAULT_NEXT_ACTIONS,
      latestRuns: [],
      error: "Supabase not configured",
    };
  }

  const from = new Date(Date.now() - periodDays * 86400000).toISOString();

  try {
    const { data: runsData, error: runsErr } = await supabase
      .from("swift_runs")
      .select("*")
      .gte("generated_at", from)
      .order("generated_at", { ascending: false })
      .limit(200);

    if (runsErr) {
      return {
        status: "error",
        storageConfigured: true,
        periodDays,
        runCount: 0,
        manualRunCount: 0,
        scheduledRunCount: 0,
        totalRawSignals: 0,
        totalCleanSignals: 0,
        totalLiveJobs: 0,
        importedLinkedInJobCount: 0,
        employmentLawSignals: [],
        employmentLawSignalCount: 0,
        employmentLawJurisdictions: [],
        employmentLawThemes: [],
        expansionSignals: [],
        downsizingSignals: [],
        restructuringSignals: [],
        expansionSignalCount: 0,
        downsizingSignalCount: 0,
        restructuringSignalCount: 0,
        excludedExpansionCandidates: [],
        excludedDownsizingCandidates: [],
        expansionVsDownsizingTrend: "",
        expansionPeopleImplication: undefined,
        expansionSuggestedHrbpLine: undefined,
        classificationNotes: undefined,
        recommendedEmploymentLawFocus: [],
        recommendedOrgPlanningFocus: [],
        liveJobs: [],
        liveJobsTotalDeduped: 0,
        liveJobsHasMore: false,
        sourceExamples: [],
        repeatedCompanies: [],
        topSources: [],
        topThemes: [],
        recommendedLearningFocus: [],
        suggestedNextActions: DEFAULT_NEXT_ACTIONS,
        latestRuns: [],
        error: runsErr.message,
      };
    }

    const runs = (runsData ?? []) as Record<string, unknown>[];
    const runIds = runs
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string");

    let marketSignals: Record<string, unknown>[] = [];
    let jobs: Record<string, unknown>[] = [];
    let health: Record<string, unknown>[] = [];
    let registrySnapshots: Record<string, unknown>[] = [];

    if (runIds.length) {
      const [sigRes, jobRes, healthRes, regRes] = await Promise.all([
        supabase.from("swift_market_signals").select("*").in("run_id", runIds),
        supabase.from("swift_job_opportunities").select("*").in("run_id", runIds),
        supabase.from("swift_source_health").select("*").in("run_id", runIds),
        supabase.from("swift_source_registry_snapshots").select("*").in("run_id", runIds),
      ]);
      marketSignals = (sigRes.data ?? []) as Record<string, unknown>[];
      jobs = (jobRes.data ?? []) as Record<string, unknown>[];
      health = (healthRes.data ?? []) as Record<string, unknown>[];
      registrySnapshots = (regRes.data ?? []) as Record<string, unknown>[];
    }

    const { data: impData } = await supabase
      .from("swift_imported_job_alerts")
      .select("*")
      .gte("created_at", from)
      .limit(400);
    const importedAlerts = (impData ?? []) as Record<string, unknown>[];

    let manualRunCount = 0;
    let scheduledRunCount = 0;
    let totalRawSignals = 0;
    let totalCleanSignals = 0;
    let totalLiveJobsFromRuns = 0;

    for (const run of runs) {
      const rt = typeof run.run_type === "string" ? run.run_type : "";
      if (rt === "manual") manualRunCount++;
      if (rt === "scheduled") scheduledRunCount++;
      totalRawSignals += typeof run.raw_signal_count === "number" ? run.raw_signal_count : 0;
      totalCleanSignals += typeof run.clean_signal_count === "number" ? run.clean_signal_count : 0;
      totalLiveJobsFromRuns += typeof run.live_job_count === "number" ? run.live_job_count : 0;
    }

    const mappedWeeklyJobs = [
      ...jobs.map(mapDbJobRowToWeeklyLiveJob),
      ...importedAlerts.map(mapImportedAlertDbRowToWeeklyLiveJob),
    ];
    const {
      liveJobs,
      liveJobsTotalDeduped,
      liveJobsHasMore,
    } = buildCappedWeeklyLiveJobsList(mappedWeeklyJobs);
    const totalLiveJobs =
      liveJobsTotalDeduped > 0 ? liveJobsTotalDeduped : jobs.length > 0 ? jobs.length : totalLiveJobsFromRuns;
    const importedLinkedInJobCount = importedAlerts.length;

    const sourceExamples: WeeklySourceExample[] = [];
    {
      const seenUrl = new Set<string>();
      for (const s of marketSignals) {
        const title = typeof s.title === "string" ? s.title.trim() : "";
        const url = typeof s.source_url === "string" ? s.source_url.trim() : "";
        if (!title || !url || !/^https?:\/\//i.test(url)) continue;
        const key = url.toLowerCase();
        if (seenUrl.has(key)) continue;
        seenUrl.add(key);
        sourceExamples.push({ title, url });
        if (sourceExamples.length >= 5) break;
      }
    }

    const companyMap = new Map<string, number>();
    for (const j of [...jobs, ...importedAlerts]) {
      const c = typeof j.company === "string" ? j.company.trim() : "";
      if (!c) continue;
      companyMap.set(c, (companyMap.get(c) ?? 0) + 1);
    }
    const repeatedCompanies = [...companyMap.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([company, count]) => ({ company, count }));

    const sourceMap = new Map<string, number>();
    for (const s of marketSignals) {
      const name = typeof s.source_name === "string" ? s.source_name.trim() : "";
      if (!name) continue;
      const k = normSource(name);
      sourceMap.set(k, (sourceMap.get(k) ?? 0) + 1);
    }
    for (const j of jobs) {
      const name = typeof j.source === "string" ? j.source.trim() : "";
      if (!name) continue;
      const k = normSource(name);
      sourceMap.set(k, (sourceMap.get(k) ?? 0) + 1);
    }
    if (importedAlerts.length > 0) {
      const k = normSource("LinkedIn Job Alert");
      sourceMap.set(k, (sourceMap.get(k) ?? 0) + importedAlerts.length);
    }
    for (const h of health) {
      const name = typeof h.source_name === "string" ? h.source_name.trim() : "";
      if (!name) continue;
      const k = normSource(name);
      sourceMap.set(k, (sourceMap.get(k) ?? 0) + 1);
    }
    const topSources = [...sourceMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([source, count]) => ({ source, count }));

    const themeTotals = new Map<string, number>();

    const scanBlob = (text: string) => {
      mergeThemeCounts(themeTotals, countThemesInText(text));
    };

    for (const s of marketSignals) {
      const blob = [
        s.title,
        s.summary,
        s.why_it_matters,
        s.hrbp_implication,
        s.source_name,
        s.category,
      ]
        .filter((x): x is string => typeof x === "string")
        .join(" ");
      scanBlob(blob);
    }

    for (const j of jobs) {
      const blob = [j.role, j.company, j.why_this_fits, j.recommended_action]
        .filter((x): x is string => typeof x === "string")
        .join(" ");
      scanBlob(blob);
    }

    for (const h of health) {
      const blob = [h.status, h.error_message]
        .filter((x): x is string => typeof x === "string")
        .join(" ");
      scanBlob(blob);
    }

    for (const run of runs) {
      const h = typeof run.headline === "string" ? run.headline : "";
      const e = typeof run.executive_summary === "string" ? run.executive_summary : "";
      scanBlob(`${h} ${e}`);
      scanBlob(extractReportText(run.report_json));
    }

    mergeThemeCounts(themeTotals, countKeywordThemesInRows([...marketSignals, ...jobs, ...importedAlerts]));

    const employmentLawSignals = extractEmploymentLawSnippets(marketSignals, 8);
    const expansionSignals = extractExpansionSnippets(marketSignals, 8);
    const downsizingSignals = extractDownsizingSnippets(marketSignals, 8);
    const restructuringSignals = extractRestructuringSnippets(marketSignals, 8);
    const excludedExpansionCandidates = extractExcludedExpansionCandidates(marketSignals, 8);
    const excludedDownsizingCandidates = extractExcludedDownsizingCandidates(marketSignals, 8);
    const employmentLawSignalCount = employmentLawSignals.length;
    const employmentLawJurisdictions = [
      ...new Set(
        employmentLawSignals
          .map((s) => s.jurisdiction)
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0),
      ),
    ];
    const employmentLawThemes = [
      ...new Set(
        employmentLawSignals
          .map((s) => s.lawTheme)
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0),
      ),
    ];
    const expansionSignalCount = expansionSignals.length;
    const downsizingSignalCount = downsizingSignals.length;
    const restructuringSignalCount = restructuringSignals.length;
    const expansionVsDownsizingTrend = buildExpansionVsDownsizingTrend(
      expansionSignalCount,
      downsizingSignalCount,
      restructuringSignalCount,
    );
    const expansionPeopleImplication =
      expansionSignalCount === 0 && downsizingSignalCount === 0 && restructuringSignalCount === 0
        ? undefined
        : expansionSignalCount > downsizingSignalCount + restructuringSignalCount
          ? "Expansion-qualified headlines suggest hiring, footprint moves and operating-model pressure."
          : downsizingSignalCount + restructuringSignalCount > expansionSignalCount
            ? "Headcount and transformation signals imply ER, consultation and change-management emphasis."
            : "Mixed expansion and contraction — scenario-test headcount, location and leadership coverage.";
    const recommendedEmploymentLawFocus =
      employmentLawSignalCount > 0
        ? [
            "Validate jurisdiction and employee segments before policy or ER actions; route complex cases to qualified counsel.",
          ]
        : [];
    const recommendedOrgPlanningFocus: string[] = [];
    if (expansionSignalCount > downsizingSignalCount + restructuringSignalCount && expansionSignalCount > 0) {
      recommendedOrgPlanningFocus.push(
        "Pressure-test hiring plans, leadership coverage and location strategy against expansion-qualified signals.",
      );
    } else if (
      downsizingSignalCount + restructuringSignalCount > expansionSignalCount &&
      downsizingSignalCount + restructuringSignalCount > 0
    ) {
      recommendedOrgPlanningFocus.push(
        "Refresh change narratives, redundancy governance and productivity storylines for leadership Q&A.",
      );
    }
    const expansionSuggestedHrbpLine =
      recommendedOrgPlanningFocus[0] ??
      "Connect headlines to workforce plans, manager enablement and risk narratives within the week.";
    const classificationNotes =
      "Classified via intelligenceTaxonomy: expansion requires explicit organisation action + workforce/footprint cue; downsizing/restructuring require explicit workforce/org change; generic HR learning, product updates and crypto/fund launches are excluded unless workforce-linked.";

    const topThemes = [...themeTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([theme, count]) => ({ theme, count }));

    const recommendedLearningFocus = deriveLearningFocus(themeTotals, topThemes);

    const suggestedNextActions = buildSuggestedWeeklyActions({
      employmentLawHitCount: employmentLawSignalCount,
      expansionSnippetCount: expansionSignalCount,
      downsizingSnippetCount: downsizingSignalCount + restructuringSignalCount,
      linkedinImportCount: importedLinkedInJobCount,
    });

    const sourceRegistry = (() => {
      if (registrySnapshots.length === 0) return undefined;

      const runGeneratedAt = new Map<string, string>();
      for (const r of runs) {
        if (typeof r.id === "string" && typeof r.generated_at === "string") {
          runGeneratedAt.set(r.id, r.generated_at);
        }
      }

      // Latest snapshot = most recent run (generated_at desc) that has a snapshot.
      const snapshotByRun = new Map<string, Record<string, unknown>>();
      for (const s of registrySnapshots) {
        if (typeof s.run_id === "string" && !snapshotByRun.has(s.run_id)) {
          snapshotByRun.set(s.run_id, s);
        }
      }

      const latest = runs
        .map((r) => (typeof r.id === "string" ? snapshotByRun.get(r.id) : undefined))
        .find(Boolean) as Record<string, unknown> | undefined;

      const latestTotalSources =
        latest && typeof latest.total_sources === "number" ? latest.total_sources : 0;
      const latestEnabledSources =
        latest && typeof latest.enabled_sources === "number" ? latest.enabled_sources : 0;
      const latestRssEnabled =
        latest && typeof latest.rss_enabled === "number" ? latest.rss_enabled : 0;

      const latestPlannedBreakdown = {
        api: latest && typeof latest.api_planned === "number" ? latest.api_planned : 0,
        json: latest && typeof latest.json_planned === "number" ? latest.json_planned : 0,
        manual: latest && typeof latest.manual_planned === "number" ? latest.manual_planned : 0,
      };

      const enabledSourcesTrend = runs
        .slice()
        .reverse() // oldest → newest
        .map((r) => {
          const id = typeof r.id === "string" ? r.id : null;
          if (!id) return null;
          const snap = snapshotByRun.get(id);
          if (!snap) return null;
          const generatedAt =
            runGeneratedAt.get(id) ?? (typeof r.generated_at === "string" ? r.generated_at : "");
          return {
            generatedAt,
            enabledSources: typeof snap.enabled_sources === "number" ? snap.enabled_sources : 0,
            totalSources: typeof snap.total_sources === "number" ? snap.total_sources : 0,
            rssEnabled: typeof snap.rss_enabled === "number" ? snap.rss_enabled : 0,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(-30);

      const sourceMixByType =
        latest && latest.by_type && typeof latest.by_type === "object"
          ? (latest.by_type as Record<string, number>)
          : {};
      const sourceMixByTopic =
        latest && latest.by_topic && typeof latest.by_topic === "object"
          ? (latest.by_topic as Record<string, number>)
          : {};

      return {
        latestTotalSources,
        latestEnabledSources,
        latestRssEnabled,
        latestPlannedBreakdown,
        enabledSourcesTrend,
        sourceMixByType,
        sourceMixByTopic,
      };
    })();

    return {
      status: "ok",
      storageConfigured: true,
      periodDays,
      runCount: runs.length,
      manualRunCount,
      scheduledRunCount,
      totalRawSignals,
      totalCleanSignals,
      totalLiveJobs,
      importedLinkedInJobCount,
      employmentLawSignals,
      employmentLawSignalCount,
      employmentLawJurisdictions,
      employmentLawThemes,
      expansionSignals,
      downsizingSignals,
      restructuringSignals,
      expansionSignalCount,
      downsizingSignalCount,
      restructuringSignalCount,
      excludedExpansionCandidates,
      excludedDownsizingCandidates,
      expansionVsDownsizingTrend,
      expansionPeopleImplication,
      expansionSuggestedHrbpLine,
      classificationNotes,
      recommendedEmploymentLawFocus,
      recommendedOrgPlanningFocus,
      liveJobs,
      liveJobsTotalDeduped,
      liveJobsHasMore,
      sourceExamples,
      repeatedCompanies,
      topSources,
      topThemes,
      recommendedLearningFocus,
      suggestedNextActions,
      latestRuns: runs.slice(0, 20),
      sourceRegistry,
    };
  } catch (e) {
    return {
      status: "error",
      storageConfigured: true,
      periodDays,
      runCount: 0,
      manualRunCount: 0,
      scheduledRunCount: 0,
      totalRawSignals: 0,
      totalCleanSignals: 0,
      totalLiveJobs: 0,
      importedLinkedInJobCount: 0,
      employmentLawSignals: [],
      employmentLawSignalCount: 0,
      employmentLawJurisdictions: [],
      employmentLawThemes: [],
      expansionSignals: [],
      downsizingSignals: [],
      restructuringSignals: [],
      expansionSignalCount: 0,
      downsizingSignalCount: 0,
      restructuringSignalCount: 0,
      excludedExpansionCandidates: [],
      excludedDownsizingCandidates: [],
      expansionVsDownsizingTrend: "",
      expansionPeopleImplication: undefined,
      expansionSuggestedHrbpLine: undefined,
      classificationNotes: undefined,
      recommendedEmploymentLawFocus: [],
      recommendedOrgPlanningFocus: [],
      liveJobs: [],
      liveJobsTotalDeduped: 0,
      liveJobsHasMore: false,
      sourceExamples: [],
      repeatedCompanies: [],
      topSources: [],
      topThemes: [],
      recommendedLearningFocus: [],
      suggestedNextActions: DEFAULT_NEXT_ACTIONS,
      latestRuns: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
