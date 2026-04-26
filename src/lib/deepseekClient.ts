import { aiReportContractPrompt } from "@/lib/aiReportContractPrompt";
import {
  buildExpansionVsDownsizingTrend,
  extractDownsizingSnippets,
  extractEmploymentLawSnippets,
  extractExpansionSnippets,
  extractRestructuringSnippets,
} from "@/lib/swiftKeywordIntel";
import type {
  AIReportContract,
  ApplicationStatus,
  CleanMarketSignal,
  ExpansionDownsizingTopSignalRef,
  HistoricalJobLink,
  NeedsManualReviewJob,
  SuggestedChannelStatus,
  SuggestedNewChannel,
} from "@/lib/types";

const DEEPSEEK_BASE = "https://api.deepseek.com";
const DEEPSEEK_CHAT_PATH = "/chat/completions";
const MODEL_PRIMARY = "deepseek-v4-flash";
const MODEL_FALLBACK = "deepseek-chat";
const PREVIEW_LEN = 500;

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "To Review",
  "Interested",
  "Applied",
  "Rejected",
  "Archived",
];

const SUGGESTED_CHANNEL_STATUSES: SuggestedChannelStatus[] = [
  "Suggested",
  "Approved",
  "Ignored",
  "Added Later",
];

const BRIEF_CATEGORIES = ["web3_ai", "hrbp"] as const;

const ASSET_FORMATS = ["PPT", "One-pager", "Framework", "Skill File", "Brief"] as const;

type SkillToPickUpRow = AIReportContract["skillsToPickUp"][number];
type LearningAssetRecRow = AIReportContract["learningAssetRecommendations"][number];

type ChatEnvelope = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string | null } }>;
};

export type DeepSeekInvokeDiagnostics = {
  apiStatus: number | null;
  apiErrorMessage?: string;
  rawResponsePreview: string;
  parseError?: string;
  validationMissingFields?: string[];
  modelsAttempted: string[];
};

export type DeepSeekReportResult =
  | { ok: true; contract: AIReportContract; diagnostics: DeepSeekInvokeDiagnostics }
  | { ok: false; diagnostics: DeepSeekInvokeDiagnostics };

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

export function shouldUseDeepSeek(): boolean {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  return isDeepSeekConfigured() && provider === "deepseek";
}

function preview(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= PREVIEW_LEN ? t : `${t.slice(0, PREVIEW_LEN)}…`;
}

/** Strip ``` / ```json fences (first fence block if present). */
function stripMarkdownFences(text: string): string {
  const t = text.trim();
  const open = t.indexOf("```");
  if (open === -1) return t;
  let inner = t.slice(open + 3);
  if (inner.toLowerCase().startsWith("json")) {
    inner = inner.slice(4).trimStart();
  }
  const close = inner.indexOf("```");
  if (close !== -1) {
    return inner.slice(0, close).trim();
  }
  inner = inner.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return inner.trim();
}

/** First balanced `{ ... }` substring (respects strings). */
function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAssistantJson(content: string): { value: unknown; parseError?: string } {
  const unfenced = stripMarkdownFences(content);
  const tryParse = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  let parsed = tryParse(unfenced);
  if (parsed !== undefined) return { value: parsed };

  const slice = extractFirstBalancedJsonObject(unfenced);
  if (slice) {
    parsed = tryParse(slice);
    if (parsed !== undefined) return { value: parsed };
    try {
      JSON.parse(slice);
    } catch (e) {
      return {
        value: null,
        parseError: e instanceof Error ? e.message : "JSON.parse failed after extraction",
      };
    }
  }

  try {
    JSON.parse(unfenced);
  } catch (e) {
    return {
      value: null,
      parseError: e instanceof Error ? e.message : "JSON.parse failed",
    };
  }
  return { value: null, parseError: "No JSON object found" };
}

function isHistoricalJobLink(v: unknown): v is HistoricalJobLink {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.role === "string" &&
    typeof o.company === "string" &&
    typeof o.location === "string" &&
    typeof o.source === "string" &&
    typeof o.applyUrl === "string" &&
    typeof o.dateFound === "string" &&
    typeof o.fitScore === "number" &&
    typeof o.applicationStatus === "string" &&
    APPLICATION_STATUSES.includes(o.applicationStatus as ApplicationStatus) &&
    typeof o.whyThisFits === "string" &&
    Array.isArray(o.gaps) &&
    o.gaps.every((g) => typeof g === "string") &&
    typeof o.recommendedAction === "string" &&
    (o.notes === undefined || typeof o.notes === "string")
  );
}

function isNeedsManualReviewJob(v: unknown): v is NeedsManualReviewJob {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.roleHint === "string" &&
    (o.companyHint === undefined || typeof o.companyHint === "string") &&
    typeof o.sourceName === "string" &&
    (o.sourceUrl === undefined || typeof o.sourceUrl === "string") &&
    typeof o.reason === "string"
  );
}

function isSkillToPickUpItem(v: unknown): v is SkillToPickUpRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.skill === "string" &&
    (o.priority === "High" || o.priority === "Medium" || o.priority === "Low") &&
    typeof o.evidence === "string" &&
    typeof o.nextAction === "string" &&
    typeof o.relatedLearningAsset === "string"
  );
}

function isSuggestedNewChannel(v: unknown): v is SuggestedNewChannel {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const ct = o.channelType;
  const okType =
    ct === "job_board" ||
    ct === "company_careers" ||
    ct === "linkedin_saved_search" ||
    ct === "newsletter" ||
    ct === "community" ||
    ct === "manual";
  return (
    typeof o.id === "string" &&
    typeof o.channelName === "string" &&
    okType &&
    typeof o.url === "string" &&
    typeof o.reasonToAdd === "string" &&
    typeof o.expectedSignal === "string" &&
    (o.priority === "High" || o.priority === "Medium" || o.priority === "Low") &&
    typeof o.status === "string" &&
    SUGGESTED_CHANNEL_STATUSES.includes(o.status as SuggestedChannelStatus)
  );
}

function isLearningAssetRecommendation(v: unknown): v is LearningAssetRecRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const linkedOk = o.linkedSkill === undefined || typeof o.linkedSkill === "string";
  return (
    typeof o.topic === "string" &&
    typeof o.recommendedAsset === "string" &&
    ASSET_FORMATS.includes(o.format as (typeof ASSET_FORMATS)[number]) &&
    typeof o.reason === "string" &&
    typeof o.nextAction === "string" &&
    linkedOk
  );
}

function snippetToTopSignalRef(s: {
  title: string;
  url?: string;
  sourceName?: string;
}): ExpansionDownsizingTopSignalRef {
  return {
    title: s.title,
    sourceUrl: s.url && /^https?:\/\//i.test(s.url) ? s.url : "",
    sourceName: s.sourceName?.trim() || undefined,
  };
}

function mergeTopDownsizingRestructure(
  down: { title: string; url?: string; sourceName?: string }[],
  restruct: { title: string; url?: string; sourceName?: string }[],
): ExpansionDownsizingTopSignalRef[] {
  const merged = [...down, ...restruct];
  const seen = new Set<string>();
  const out: ExpansionDownsizingTopSignalRef[] = [];
  for (const s of merged) {
    const k = `${s.title}|${(s.url ?? "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(snippetToTopSignalRef(s));
    if (out.length >= 2) break;
  }
  return out;
}

function coerceTopSignalRefs(arr: unknown): ExpansionDownsizingTopSignalRef[] {
  if (!Array.isArray(arr)) return [];
  const out: ExpansionDownsizingTopSignalRef[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.title !== "string") continue;
    const su = typeof o.sourceUrl === "string" ? o.sourceUrl : "";
    out.push({
      title: o.title,
      sourceUrl: su,
      sourceName: typeof o.sourceName === "string" && o.sourceName.trim() ? o.sourceName.trim() : undefined,
    });
    if (out.length >= 2) break;
  }
  return out;
}

function cleanSignalsToKeywordRows(signals: CleanMarketSignal[]): Record<string, unknown>[] {
  return signals.map((x) => ({
    title: x.title,
    summary: x.summary,
    why_it_matters: x.whyItMatters,
    hrbp_implication: x.hrbpImplication,
    source_url: x.url,
    category: x.category,
  }));
}

export function buildDeterministicContractIntel(signals: CleanMarketSignal[]): {
  employmentLaw: AIReportContract["employmentLaw"];
  expansionDownsizing: AIReportContract["expansionDownsizing"];
} {
  const rows = cleanSignalsToKeywordRows(signals);
  const emp = extractEmploymentLawSnippets(rows, 4);
  const exp = extractExpansionSnippets(rows, 6);
  const down = extractDownsizingSnippets(rows, 6);
  const restruct = extractRestructuringSnippets(rows, 6);
  const employmentLaw: AIReportContract["employmentLaw"] = {
    headline:
      emp.length > 0
        ? "Employment law signals detected (taxonomy-qualified scan)"
        : "No strong employment law update found in current run",
    disclaimer:
      "Not legal advice. SWIFT surfaces HRBP implications from public signals only; validate material changes with qualified counsel.",
    items: emp.map((s) => ({
      title: s.title,
      sourceName: s.sourceName?.trim() || "RSS / SWIFT signal",
      sourceUrl: s.url ?? "",
      whatChanged: s.summary.slice(0, 220) || s.title,
      whyItMatters:
        "Public-source item matched SWIFT employment-law taxonomy (workforce / workplace / ER themes). Confirm facts before acting.",
      hrbpImplication:
        s.hrbpImplication ??
        "Triage with People/Legal for affected jurisdictions, policies and manager guidance.",
      suggestedAction:
        s.suggestedAction ??
        "Route to policy/ER review if the signal touches your operating locations or employee segments; otherwise monitor.",
      jurisdiction: s.jurisdiction,
      lawTheme: s.lawTheme,
      confidence: s.confidence,
      whyItQualifies: s.whyItQualifies,
    })),
  };

  const sourceUrls = [...exp, ...down, ...restruct]
    .map((s) => s.url)
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));

  const trend = buildExpansionVsDownsizingTrend(exp.length, down.length, restruct.length);

  const strongestEx = exp[0]?.title ?? "";
  const strongestDn = down[0]?.title ?? restruct[0]?.title ?? "";

  const expansionDownsizing: AIReportContract["expansionDownsizing"] = {
    expansionCount: exp.length,
    downsizingCount: down.length,
    restructuringCount: restruct.length,
    expansionSummary: exp.length
      ? `${trend} Highlights: ${exp.map((e) => e.title).join(" · ").slice(0, 400)}`
      : `${trend} No qualified expansion cluster in this RSS window.`,
    downsizingSummary: down.length
      ? down
          .map((e) => e.title)
          .join(" · ")
          .slice(0, 480)
      : "No qualified downsizing / headcount cluster in this RSS window.",
    restructuringSummary: restruct.length
      ? restruct
          .map((e) => e.title)
          .join(" · ")
          .slice(0, 420)
      : "No restructuring / transformation cluster in this RSS window.",
    strongestSignal: strongestEx || strongestDn || trend,
    strongestExpansionSignal: strongestEx,
    strongestDownsizingSignal: down[0]?.title ?? restruct[0]?.title ?? "",
    topExpansionSignals: exp.slice(0, 2).map(snippetToTopSignalRef),
    topDownsizingRestructureSignals: mergeTopDownsizingRestructure(down, restruct),
    peopleImplication:
      exp.length > down.length + restruct.length
        ? "Qualified expansion signals point to hiring demand, footprint and operating-model pressure on HRBPs."
        : down.length + restruct.length > exp.length
          ? "Downsizing and restructuring signals elevate workforce planning, ER risk and change leadership."
          : "Mixed expansion and contraction signals — calibrate workforce plans and leadership narratives.",
    suggestedHrbpAction:
      "Prioritise 1–2 exec-ready questions on hiring, location strategy, restructuring governance and manager enablement; cite listed sources.",
    sourceUrls,
  };

  return { employmentLaw, expansionDownsizing };
}

function mergeSignalDerivedContractModules(
  o: Record<string, unknown>,
  signals: CleanMarketSignal[],
): ReturnType<typeof buildDeterministicContractIntel> {
  const d = buildDeterministicContractIntel(signals);
  const el = o.employmentLaw;
  if (!el || typeof el !== "object" || !Array.isArray((el as Record<string, unknown>).items)) {
    o.employmentLaw = d.employmentLaw;
  } else {
    const items = (el as Record<string, unknown>).items as unknown[];
    if (items.length === 0) {
      o.employmentLaw = d.employmentLaw;
    }
  }
  const ex = o.expansionDownsizing;
  if (!ex || typeof ex !== "object") {
    o.expansionDownsizing = d.expansionDownsizing;
  }
  return d;
}

function mergeJobOpportunityDefaults(o: Record<string, unknown>, jobs: HistoricalJobLink[]): void {
  if (!Array.isArray(o.jobOpportunities) || jobs.length === 0) return;
  if (o.jobOpportunities.length > 0) return;
  o.jobOpportunities = jobs.slice(0, 5);
}

/** Patch common partial shapes before strict validation. */
function patchContractRoot(o: Record<string, unknown>, signals: CleanMarketSignal[]): void {
  const det = mergeSignalDerivedContractModules(o, signals);
  const ex = o.expansionDownsizing;
  if (ex && typeof ex === "object") {
    const r = ex as Record<string, unknown>;
    if (typeof r.expansionCount !== "number") r.expansionCount = 0;
    if (typeof r.downsizingCount !== "number") r.downsizingCount = 0;
    if (typeof r.restructuringCount !== "number") r.restructuringCount = 0;
    for (const f of [
      "expansionSummary",
      "downsizingSummary",
      "restructuringSummary",
      "strongestSignal",
      "strongestExpansionSignal",
      "strongestDownsizingSignal",
      "peopleImplication",
      "suggestedHrbpAction",
    ] as const) {
      if (typeof r[f] !== "string") r[f] = "";
    }
    if (!r.strongestExpansionSignal && typeof r.strongestSignal === "string") {
      r.strongestExpansionSignal = r.strongestSignal;
    }
    if (!Array.isArray(r.sourceUrls)) r.sourceUrls = [];
    let topExp = coerceTopSignalRefs(r.topExpansionSignals);
    let topDnRest = coerceTopSignalRefs(r.topDownsizingRestructureSignals);
    const detEx = det.expansionDownsizing;
    if (topExp.length === 0 && detEx.topExpansionSignals.length > 0) {
      topExp = detEx.topExpansionSignals;
    }
    if (topDnRest.length === 0 && detEx.topDownsizingRestructureSignals.length > 0) {
      topDnRest = detEx.topDownsizingRestructureSignals;
    }
    r.topExpansionSignals = topExp;
    r.topDownsizingRestructureSignals = topDnRest;
  }
  const el = o.employmentLaw;
  if (el && typeof el === "object") {
    const r = el as Record<string, unknown>;
    if (typeof r.headline !== "string") r.headline = "";
    if (typeof r.disclaimer !== "string") {
      r.disclaimer =
        "Not legal advice. SWIFT surfaces HRBP implications from public signals only; validate material changes with qualified counsel.";
    }
    if (!Array.isArray(r.items)) r.items = [];
  }
}

function keySignalIssues(ks: unknown, path: string): string[] {
  const miss: string[] = [];
  if (!ks || typeof ks !== "object") return [`${path}: must be an object`];
  const k = ks as Record<string, unknown>;
  const fields = [
    "title",
    "sourceName",
    "sourceUrl",
    "whyItMatters",
    "hrbpImplication",
    "recommendedAction",
  ] as const;
  for (const f of fields) {
    if (typeof k[f] !== "string") miss.push(`${path}.${f}: must be a string`);
  }
  if (k.whatHappened !== undefined && typeof k.whatHappened !== "string") {
    miss.push(`${path}.whatHappened: must be a string when present`);
  }
  return miss;
}

function employmentLawItemIssues(it: unknown, path: string): string[] {
  const miss: string[] = [];
  if (!it || typeof it !== "object") return [`${path}: must be an object`];
  const x = it as Record<string, unknown>;
  for (const f of [
    "title",
    "sourceName",
    "sourceUrl",
    "whatChanged",
    "whyItMatters",
    "hrbpImplication",
    "suggestedAction",
  ] as const) {
    if (typeof x[f] !== "string") miss.push(`${path}.${f}: must be a string`);
  }
  for (const opt of ["jurisdiction", "lawTheme", "whyItQualifies"] as const) {
    if (x[opt] !== undefined && typeof x[opt] !== "string") {
      miss.push(`${path}.${opt}: must be a string when present`);
    }
  }
  if (x.confidence !== undefined) {
    const c = x.confidence;
    if (c !== "high" && c !== "medium" && c !== "low") {
      miss.push(`${path}.confidence: must be high|medium|low when present`);
    }
  }
  return miss;
}

function expansionDownsizingIssues(v: unknown): string[] {
  const miss: string[] = [];
  if (!v || typeof v !== "object") return ["expansionDownsizing: must be an object"];
  const o = v as Record<string, unknown>;
  if (typeof o.expansionCount !== "number") miss.push("expansionDownsizing.expansionCount: must be a number");
  if (typeof o.downsizingCount !== "number") miss.push("expansionDownsizing.downsizingCount: must be a number");
  if (typeof o.restructuringCount !== "number") miss.push("expansionDownsizing.restructuringCount: must be a number");
  for (const f of [
    "expansionSummary",
    "downsizingSummary",
    "restructuringSummary",
    "strongestSignal",
    "strongestExpansionSignal",
    "strongestDownsizingSignal",
    "peopleImplication",
    "suggestedHrbpAction",
  ] as const) {
    if (typeof o[f] !== "string") miss.push(`expansionDownsizing.${f}: must be a string`);
  }
  if (!Array.isArray(o.sourceUrls)) miss.push("expansionDownsizing.sourceUrls: must be an array");
  else if (!o.sourceUrls.every((u) => typeof u === "string")) {
    miss.push("expansionDownsizing.sourceUrls: must be string[]");
  }
  for (const [key, maxLen] of [
    ["topExpansionSignals", 2],
    ["topDownsizingRestructureSignals", 2],
  ] as const) {
    const arr = o[key];
    if (!Array.isArray(arr)) {
      miss.push(`expansionDownsizing.${key}: must be an array`);
      continue;
    }
    if (arr.length > maxLen) {
      miss.push(`expansionDownsizing.${key}: must have at most ${maxLen} items`);
    }
    arr.forEach((it, i) => {
      if (!it || typeof it !== "object") {
        miss.push(`expansionDownsizing.${key}[${i}]: must be an object`);
        return;
      }
      const x = it as Record<string, unknown>;
      if (typeof x.title !== "string") miss.push(`expansionDownsizing.${key}[${i}].title: must be a string`);
      if (typeof x.sourceUrl !== "string") {
        miss.push(`expansionDownsizing.${key}[${i}].sourceUrl: must be a string`);
      }
      if (x.sourceName !== undefined && typeof x.sourceName !== "string") {
        miss.push(`expansionDownsizing.${key}[${i}].sourceName: must be a string when present`);
      }
    });
  }
  return miss;
}

/** Detailed validation; empty array means value satisfies AIReportContract (including layout rules). */
export function getAIReportContractValidationIssues(v: unknown): string[] {
  const miss: string[] = [];
  if (!v || typeof v !== "object") return ["root: must be a JSON object"];

  const o = v as Record<string, unknown>;

  if (typeof o.executiveSummary !== "string") miss.push("executiveSummary: must be a string");

  if (!Array.isArray(o.marketBriefs)) {
    miss.push("marketBriefs: must be an array");
  } else {
    if (o.marketBriefs.length !== 2) {
      miss.push(`marketBriefs: must have length exactly 2 (got ${o.marketBriefs.length})`);
    }
    o.marketBriefs.forEach((b, i) => {
      const p = `marketBriefs[${i}]`;
      if (!b || typeof b !== "object") {
        miss.push(`${p}: must be an object`);
        return;
      }
      const brief = b as Record<string, unknown>;
      if (typeof brief.headline !== "string") miss.push(`${p}.headline: must be a string`);
      const cat = brief.category;
      if (i === 0 && cat !== "web3_ai") miss.push(`${p}.category: must be "web3_ai"`);
      if (i === 1 && cat !== "hrbp") miss.push(`${p}.category: must be "hrbp"`);
      if (i >= 2) return;
      if (
        typeof cat === "string" &&
        !BRIEF_CATEGORIES.includes(cat as (typeof BRIEF_CATEGORIES)[number])
      ) {
        miss.push(`${p}.category: must be "web3_ai" or "hrbp"`);
      }
      if (!Array.isArray(brief.keySignals)) {
        miss.push(`${p}.keySignals: must be an array`);
      } else {
        brief.keySignals.forEach((ks, j) => {
          miss.push(...keySignalIssues(ks, `${p}.keySignals[${j}]`));
        });
      }
    });
  }

  if (!Array.isArray(o.jobOpportunities)) {
    miss.push("jobOpportunities: must be an array");
  } else {
    o.jobOpportunities.forEach((job, i) => {
      if (!isHistoricalJobLink(job)) {
        miss.push(`jobOpportunities[${i}]: invalid HistoricalJobLink (check types/enums/applyUrl/fitScore/gaps)`);
      }
    });
  }

  if (!Array.isArray(o.needsManualReview)) {
    miss.push("needsManualReview: must be an array");
  } else {
    o.needsManualReview.forEach((row, i) => {
      if (!isNeedsManualReviewJob(row)) {
        miss.push(`needsManualReview[${i}]: invalid shape (need id, roleHint, sourceName, reason)`);
      }
    });
  }

  if (!Array.isArray(o.skillsToPickUp)) {
    miss.push("skillsToPickUp: must be an array");
  } else {
    o.skillsToPickUp.forEach((row, i) => {
      if (!isSkillToPickUpItem(row)) {
        miss.push(
          `skillsToPickUp[${i}]: invalid (need skill, priority High|Medium|Low, evidence, nextAction, relatedLearningAsset)`,
        );
      }
    });
  }

  if (!Array.isArray(o.suggestedNewChannels)) {
    miss.push("suggestedNewChannels: must be an array");
  } else {
    const n = o.suggestedNewChannels.length;
    if (n < 2 || n > 3) {
      miss.push(`suggestedNewChannels: must have length 2 or 3 (got ${n})`);
    }
    o.suggestedNewChannels.forEach((row, i) => {
      if (!isSuggestedNewChannel(row)) {
        miss.push(`suggestedNewChannels[${i}]: invalid SuggestedNewChannel`);
      }
    });
  }

  if (!Array.isArray(o.learningAssetRecommendations)) {
    miss.push("learningAssetRecommendations: must be an array");
  } else {
    const n = o.learningAssetRecommendations.length;
    if (n < 2 || n > 3) {
      miss.push(`learningAssetRecommendations: must have length 2 or 3 (got ${n})`);
    }
    o.learningAssetRecommendations.forEach((row, i) => {
      if (!isLearningAssetRecommendation(row)) {
        miss.push(`learningAssetRecommendations[${i}]: invalid (check format enum)`);
      }
    });
  }

  const el = o.employmentLaw;
  if (!el || typeof el !== "object") {
    miss.push("employmentLaw: must be an object");
  } else {
    const r = el as Record<string, unknown>;
    if (typeof r.headline !== "string") miss.push("employmentLaw.headline: must be a string");
    if (typeof r.disclaimer !== "string") miss.push("employmentLaw.disclaimer: must be a string");
    if (!Array.isArray(r.items)) miss.push("employmentLaw.items: must be an array");
    else
      r.items.forEach((it, i) => {
        miss.push(...employmentLawItemIssues(it, `employmentLaw.items[${i}]`));
      });
  }

  miss.push(...expansionDownsizingIssues(o.expansionDownsizing));

  return miss;
}

function isAIReportContract(v: unknown): v is AIReportContract {
  return getAIReportContractValidationIssues(v).length === 0;
}

async function callDeepSeekModel(params: {
  model: string;
  apiKey: string;
  system: string;
  user: string;
}): Promise<{
  httpStatus: number;
  bodyText: string;
  assistantContent: string | null;
  apiErrorMessage?: string;
}> {
  const url = `${DEEPSEEK_BASE}${DEEPSEEK_CHAT_PATH}`;
  const messages = [
    { role: "system" as const, content: params.system },
    { role: "user" as const, content: params.user },
  ];

  const buildBody = (jsonObject: boolean) =>
    JSON.stringify({
      model: params.model,
      messages,
      stream: false,
      ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
    });

  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: buildBody(true),
    cache: "no-store",
  });

  let bodyText = await res.text();

  if (
    !res.ok &&
    res.status === 400 &&
    /response_format|json_object/i.test(bodyText)
  ) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: buildBody(false),
      cache: "no-store",
    });
    bodyText = await res.text();
  }

  let assistantContent: string | null = null;
  let apiErrorMessage: string | undefined;

  try {
    const data = JSON.parse(bodyText) as ChatEnvelope;
    if (data.error?.message) apiErrorMessage = data.error.message;
    const c = data.choices?.[0]?.message?.content;
    if (typeof c === "string" && c.trim()) assistantContent = c.trim();
  } catch {
    if (!res.ok) apiErrorMessage = `HTTP ${res.status} (non-JSON body)`;
  }

  if (!res.ok && !apiErrorMessage) apiErrorMessage = `HTTP ${res.status}`;

  return { httpStatus: res.status, bodyText, assistantContent, apiErrorMessage };
}

function emptyDiagnostics(): DeepSeekInvokeDiagnostics {
  return {
    apiStatus: null,
    rawResponsePreview: "",
    modelsAttempted: [],
  };
}

/**
 * Full DeepSeek pipeline with diagnostics (for debug routes). Does not log secrets.
 */
export async function generateDeepSeekReportResult(input: {
  cleanedSignals: CleanMarketSignal[];
  generatedAt: string;
  jobOpportunityDefaults?: HistoricalJobLink[];
  weeklyPattern?: string;
}): Promise<DeepSeekReportResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const baseDiag = emptyDiagnostics();

  if (!apiKey || !input.cleanedSignals.length) {
    return {
      ok: false,
      diagnostics: {
        ...baseDiag,
        apiStatus: null,
        rawResponsePreview: "",
        apiErrorMessage: !apiKey ? "Missing API key" : "No cleaned signals",
      },
    };
  }

  const userPayload = {
    generatedAt: input.generatedAt,
    cleanedSignals: input.cleanedSignals,
    jobOpportunityDefaults: input.jobOpportunityDefaults ?? [],
    weeklyPattern: input.weeklyPattern ?? "",
  };

  const userContent = `${aiReportContractPrompt}

Input JSON (ground truth):
${JSON.stringify(userPayload)}`;

  const system =
    "You return only valid JSON matching the user schema. No markdown. No prose outside JSON.";

  const models = [MODEL_PRIMARY, MODEL_FALLBACK];
  let lastHttpStatus: number | null = null;
  let lastApiError: string | undefined;
  let lastBodyText = "";
  let lastAssistant = "";
  /** Latest assistant text from any HTTP-success attempt (for preview if later attempt has no body). */
  let lastHttpOkAssistant = "";

  for (const model of models) {
    baseDiag.modelsAttempted.push(model);

    let attempt: Awaited<ReturnType<typeof callDeepSeekModel>>;
    try {
      attempt = await callDeepSeekModel({
        model,
        apiKey,
        system,
        user: userContent,
      });
    } catch (err) {
      lastHttpStatus = null;
      lastApiError = err instanceof Error ? err.message : "Request failed";
      lastBodyText = "";
      lastAssistant = "";
      if (model === MODEL_FALLBACK) break;
      continue;
    }

    lastHttpStatus = attempt.httpStatus;
    lastBodyText = attempt.bodyText;
    lastAssistant = attempt.assistantContent ?? "";
    if (attempt.httpStatus > 0 && attempt.httpStatus < 400 && lastAssistant) {
      lastHttpOkAssistant = lastAssistant;
    }

    const transportFailure =
      !attempt.httpStatus || attempt.httpStatus >= 400 || Boolean(attempt.apiErrorMessage);
    const noContent = !attempt.assistantContent?.trim();

    if (transportFailure || noContent) {
      lastApiError =
        attempt.apiErrorMessage ??
        (noContent && attempt.httpStatus < 400 ? "Empty assistant content" : undefined) ??
        `HTTP ${attempt.httpStatus}`;
      if (model === MODEL_FALLBACK) {
        break;
      }
      continue;
    }

    const content = attempt.assistantContent as string;
    const parsed = parseAssistantJson(content);
    if (parsed.parseError || parsed.value === null) {
      lastApiError = undefined;
      if (model === MODEL_FALLBACK) {
        return {
          ok: false,
          diagnostics: {
            apiStatus: attempt.httpStatus,
            rawResponsePreview: preview(content),
            parseError: parsed.parseError,
            validationMissingFields: undefined,
            modelsAttempted: [...baseDiag.modelsAttempted],
          },
        };
      }
      continue;
    }

    const root = parsed.value as Record<string, unknown>;
    patchContractRoot(root, input.cleanedSignals);
    mergeJobOpportunityDefaults(root, input.jobOpportunityDefaults ?? []);

    const issues = getAIReportContractValidationIssues(root);
    if (issues.length === 0 && isAIReportContract(root)) {
      return {
        ok: true,
        contract: root as unknown as AIReportContract,
        diagnostics: {
          apiStatus: attempt.httpStatus,
          rawResponsePreview: "",
          modelsAttempted: [...baseDiag.modelsAttempted],
        },
      };
    }

    if (model === MODEL_FALLBACK) {
      return {
        ok: false,
        diagnostics: {
          apiStatus: attempt.httpStatus,
          rawResponsePreview: preview(content),
          validationMissingFields: issues,
          modelsAttempted: [...baseDiag.modelsAttempted],
        },
      };
    }
  }

  return {
    ok: false,
    diagnostics: {
      apiStatus: lastHttpStatus,
      apiErrorMessage: lastApiError,
      rawResponsePreview: preview(
        lastHttpOkAssistant || lastAssistant || lastBodyText,
      ),
      modelsAttempted: [...baseDiag.modelsAttempted],
    },
  };
}

export async function generateDeepSeekReport(input: {
  cleanedSignals: CleanMarketSignal[];
  generatedAt: string;
  jobOpportunityDefaults?: HistoricalJobLink[];
  weeklyPattern?: string;
}): Promise<AIReportContract | null> {
  const result = await generateDeepSeekReportResult(input);
  return result.ok ? result.contract : null;
}
