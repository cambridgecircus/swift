export type DashboardModuleBrief = {
  updatedAt?: string;
  status?: "updated" | "fallback" | "no_update";
  headline: string;
  summary?: string;
  signals: string[];
  sources?: Array<{
    title: string;
    publisher?: string;
    url?: string;
    date?: string;
    section?: string;
  }>;
};

export type EmploymentLawModule = {
  updatedAt?: string;
  status: "updated" | "no_update";
  headline?: string;
  summary?: string;
  signals: string[];
  items: Array<{
    title: string;
    publisher?: string;
    url?: string;
    date?: string;
    query?: string;
  }>;
};

export type ExpansionDownsizingModule = {
  updatedAt?: string;
  status: "updated" | "no_update";
  headline?: string;
  summary?: string;
  expansionCount: number;
  downsizingCount: number;
  restructuringCount: number;
  strongestSignal?: string;
  peopleImplication?: string;
  items?: Array<{
    title: string;
    publisher?: string;
    url?: string;
    date?: string;
    category?: "expansion" | "downsizing" | "restructuring";
  }>;
};

export type DashboardReport = {
  generatedAt: string;
  web3AiBrief: DashboardModuleBrief;
  hrbpBrief: DashboardModuleBrief;
  employmentLaw: EmploymentLawModule;
  expansionDownsizing: ExpansionDownsizingModule;
};

export type DashboardModuleSource = "gmail_ai" | "gmail_parser" | "rss" | "fallback" | "unknown";

export type DashboardModuleSources = {
  web3AiBrief: DashboardModuleSource;
  hrbpBrief: DashboardModuleSource;
  employmentLaw: DashboardModuleSource;
  expansionDownsizing: DashboardModuleSource;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object");
}

function cleanTextArray(input: Array<string | null | undefined>, limit = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const t = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

function pickReportContainer(raw: unknown): unknown {
  if (!isObj(raw)) return null;

  const candidates: unknown[] = [];
  const o = raw as Record<string, unknown>;
  candidates.push(o.report, o.rawReport, o.report_json, o.reportJson);
  if (isObj(o.run)) {
    const r = o.run as Record<string, unknown>;
    candidates.push(r.report, r.rawReport, r.report_json, r.reportJson);
  }
  if (isObj(o.latestRun)) {
    const r = o.latestRun as Record<string, unknown>;
    candidates.push(r.report, r.rawReport, r.report_json, r.reportJson);
  }
  if (isObj(o.result)) {
    const r = o.result as Record<string, unknown>;
    candidates.push(r.report, r.rawReport, r.report_json, r.reportJson);
  }
  // Some endpoints may already return { ok, report: DashboardReport }
  return candidates.find((x) => x !== undefined && x !== null) ?? null;
}

function coerceIsoDate(s: unknown): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type BriefLineLike = {
  title?: unknown;
  whatHappened?: unknown;
  whyItMatters?: unknown;
  hrbpImplication?: unknown;
  sourceName?: unknown;
  sourceUrl?: unknown;
};

function briefFromLines(args: {
  fallbackHeadline: string;
  lines: unknown;
  generatedAt: string;
}): DashboardModuleBrief {
  const safeLines: BriefLineLike[] = Array.isArray(args.lines) ? (args.lines as BriefLineLike[]) : [];
  const sourceTitles = cleanTextArray(
    safeLines.map((l) => (typeof l.title === "string" && l.title.trim() ? l.title.trim() : "")),
    8,
  );
  const texts = cleanTextArray(
    safeLines.map((l) => {
      const v =
        (typeof l.whyItMatters === "string" && l.whyItMatters) ||
        (typeof l.whatHappened === "string" && l.whatHappened) ||
        (typeof l.hrbpImplication === "string" && l.hrbpImplication) ||
        (typeof l.title === "string" && l.title) ||
        "";
      return v;
    }),
    8,
  );
  const headline = texts[0] ?? args.fallbackHeadline;
  const primarySignals = cleanTextArray(texts.slice(1), 4);
  const derived = cleanTextArray(sourceTitles.filter((t) => t.toLowerCase() !== headline.toLowerCase()), 6);
  const signals = (() => {
    if (primarySignals.length >= 3) return primarySignals.slice(0, 4);
    const merged = cleanTextArray([...primarySignals, ...derived], 4);
    return merged;
  })();
  const sources = cleanTextArray(
    safeLines.map((l) => (typeof l.title === "string" && l.title.trim() ? l.title.trim() : "")),
    6,
  ).map((t, idx) => ({
    title: t,
    url:
      typeof safeLines[idx]?.sourceUrl === "string" && String(safeLines[idx]?.sourceUrl).trim()
        ? String(safeLines[idx]?.sourceUrl).trim()
        : undefined,
    publisher: typeof safeLines[idx]?.sourceName === "string" ? String(safeLines[idx]?.sourceName) : undefined,
  }));

  // Consider "updated" if we have at least 1 distinct bullet beyond the headline.
  const updated = signals.length >= 1;
  return {
    updatedAt: args.generatedAt,
    status: updated ? "updated" : "fallback",
    headline,
    signals: updated ? signals : [],
    sources: sources.length ? sources : undefined,
  };
}

function employmentLawFromReport(args: { reportObj: Record<string, unknown>; generatedAt: string }): EmploymentLawModule {
  const r = args.reportObj;
  const block = isObj(r.employmentLaw) ? (r.employmentLaw as Record<string, unknown>) : null;
  const itemsRaw = block && Array.isArray(block.items) ? (block.items as unknown[]) : [];
  const items = itemsRaw
    .map((x) => (isObj(x) ? (x as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((x) => ({
      title: typeof x!.title === "string" ? x!.title : "Employment law signal",
      publisher: typeof x!.sourceName === "string" ? x!.sourceName : undefined,
      url: typeof x!.sourceUrl === "string" ? x!.sourceUrl : typeof x!.url === "string" ? x!.url : undefined,
      date: coerceIsoDate(x!.publishedAt ?? x!.published_at ?? x!.date) ?? undefined,
      query: typeof x!.query === "string" ? x!.query : undefined,
    }));

  const signalsFromWhy = cleanTextArray(
    itemsRaw.map((x) =>
      isObj(x) && typeof (x as Record<string, unknown>).whyItMatters === "string"
        ? String((x as Record<string, unknown>).whyItMatters)
        : "",
    ),
    4,
  );
  const signalsFromTitles = cleanTextArray(items.map((it) => it.title), 5);
  const signals =
    signalsFromWhy.length >= 3 ? signalsFromWhy : cleanTextArray([...signalsFromWhy, ...signalsFromTitles], 5);

  const headline = block && typeof block.headline === "string" ? block.headline : undefined;
  const summary = block && typeof block.disclaimer === "string" ? block.disclaimer : undefined;

  const updated = items.length > 0;
  return {
    updatedAt: args.generatedAt,
    status: updated ? "updated" : "no_update",
    headline,
    summary,
    signals,
    items,
  };
}

function expansionDownsizingFromReport(args: { reportObj: Record<string, unknown>; generatedAt: string }): ExpansionDownsizingModule {
  const r = args.reportObj;
  const block = isObj(r.expansionDownsizing) ? (r.expansionDownsizing as Record<string, unknown>) : null;
  const expansionCount = typeof block?.expansionCount === "number" ? block.expansionCount : 0;
  const downsizingCount = typeof block?.downsizingCount === "number" ? block.downsizingCount : 0;
  const restructuringCount = typeof block?.restructuringCount === "number" ? block.restructuringCount : 0;
  const summary = typeof block?.expansionSummary === "string" || typeof block?.downsizingSummary === "string"
    ? [block?.expansionSummary, block?.downsizingSummary, block?.restructuringSummary].filter((x) => typeof x === "string" && x).join(" ")
    : undefined;
  const strongestSignal =
    typeof block?.strongestSignal === "string"
      ? block.strongestSignal
      : typeof block?.strongestExpansionSignal === "string"
        ? block.strongestExpansionSignal
        : typeof block?.strongestDownsizingSignal === "string"
          ? block.strongestDownsizingSignal
          : undefined;
  const peopleImplication = typeof block?.peopleImplication === "string" ? block.peopleImplication : undefined;

  const updated = expansionCount + downsizingCount + restructuringCount > 0;
  return {
    updatedAt: args.generatedAt,
    status: updated ? "updated" : "no_update",
    summary,
    expansionCount,
    downsizingCount,
    restructuringCount,
    strongestSignal,
    peopleImplication,
  };
}

/**
 * Canonical normaliser for all current API shapes.
 * Accepts objects that contain IntelligenceReport-ish fields OR already-normalised DashboardReport.
 */
export function normalizeDashboardReport(raw: unknown): DashboardReport | null {
  const picked = pickReportContainer(raw) ?? raw;
  const container =
    typeof picked === "string"
      ? (() => {
          try {
            return JSON.parse(picked) as unknown;
          } catch {
            return null;
          }
        })()
      : picked;
  if (!isObj(container)) return null;

  // If already DashboardReport-ish
  if (typeof (container as Record<string, unknown>).generatedAt === "string" && isObj((container as Record<string, unknown>).web3AiBrief)) {
    return container as unknown as DashboardReport;
  }

  const reportObj = container as Record<string, unknown>;
  const generatedAt = coerceIsoDate(reportObj.generatedAt) ?? coerceIsoDate(reportObj.generated_at) ?? new Date().toISOString();

  const web3AiBrief = briefFromLines({
    fallbackHeadline: "Operators are replacing hype with execution discipline.",
    lines: reportObj.web3AiBriefLines,
    generatedAt,
  });
  const hrbpBrief = briefFromLines({
    fallbackHeadline: "Executives want fewer dashboards and more decisions.",
    lines: reportObj.hrbpBriefLines,
    generatedAt,
  });
  const employmentLaw = employmentLawFromReport({ reportObj, generatedAt });
  const expansionDownsizing = expansionDownsizingFromReport({ reportObj, generatedAt });

  return {
    generatedAt,
    web3AiBrief,
    hrbpBrief,
    employmentLaw,
    expansionDownsizing,
  };
}

export function inferDashboardModuleSources(reportObj: Record<string, unknown>): DashboardModuleSources {
  const hasLawItems = (() => {
    const law = reportObj.employmentLaw;
    return isObj(law) && Array.isArray((law as Record<string, unknown>).items) && (law as Record<string, unknown>).items && ((law as Record<string, unknown>).items as unknown[]).length > 0;
  })();
  const lawHeadline = (() => {
    const law = reportObj.employmentLaw;
    return isObj(law) && typeof (law as Record<string, unknown>).headline === "string" ? String((law as Record<string, unknown>).headline) : "";
  })();
  const employmentLaw: DashboardModuleSource =
    hasLawItems && /SWIFT Employment Law Trends/i.test(lawHeadline) ? "gmail_parser" : hasLawItems ? "rss" : "unknown";

  const web3AiBrief: DashboardModuleSource =
    Array.isArray(reportObj.web3AiBriefLines) && (reportObj.web3AiBriefLines as unknown[]).length > 0 ? "rss" : "unknown";
  const hrbpBrief: DashboardModuleSource =
    Array.isArray(reportObj.hrbpBriefLines) && (reportObj.hrbpBriefLines as unknown[]).length > 0 ? "rss" : "unknown";
  const expansionDownsizing: DashboardModuleSource =
    isObj(reportObj.expansionDownsizing) ? "rss" : "unknown";

  return { web3AiBrief, hrbpBrief, employmentLaw, expansionDownsizing };
}

