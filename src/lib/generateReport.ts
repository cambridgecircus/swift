import {
  buildDeterministicContractIntel,
  shouldUseDeepSeek,
  generateDeepSeekReport,
  triageSignalsWithDeepSeekResult,
} from "@/lib/deepseekClient";
import { fetchLinkedInJobAlertEmails } from "@/lib/gmailLinkedIn";
import { isRealJobApplyUrl } from "@/lib/jobApplyUrl";
import { gatherReportStorageContext } from "@/lib/reportStorageContext";
import { getWeeklySummary } from "@/lib/intelligenceStorage";
import { getLiveSkillsAndLearning } from "@/lib/skillsAndLearning";
import type { AIReportContract, CleanMarketSignal, HistoricalJobLink } from "@/lib/types";
import { runDailyMarketPipeline } from "@/lib/swiftDailyMarketPipeline";

export type KeySignal = {
  title: string;
  source: string;
  implication: string;
  sourceUrl?: string;
};

export type BriefLine = {
  title: string;
  whatHappened: string;
  whyItMatters: string;
  hrbpImplication: string;
  suggestedAction: string;
  sourceName: string;
  sourceUrl?: string;
};

export type EmploymentLawEmailBlock = {
  headline: string;
  disclaimer: string;
  items: Array<{
    title: string;
    whatChanged: string;
    whyItMatters: string;
    hrbpImplication: string;
    suggestedAction: string;
    sourceName: string;
    sourceUrl?: string;
    jurisdiction?: string;
    lawTheme?: string;
    confidence?: "high" | "medium" | "low";
    whyItQualifies?: string;
  }>;
};

export type LiveJobEmailRow = {
  role: string;
  company: string;
  location: string;
  source: string;
  fitScore: number;
  applyUrl?: string;
  sourceUrl?: string;
  whyThisFits: string;
};

export type SkillEmailRow = {
  skill: string;
  priorityScore: string;
  whyNow: string;
  nextAction: string;
};

export type LearningEmailRow = {
  topic: string;
  format: string;
  whyNow: string;
  linkedSkill?: string;
  intendedOutput: string;
};

export type IntelligenceReport = {
  generatedAt: string;
  headline: string;
  executiveSummary: string;
  /** Safe diagnostics — no secrets. */
  gmailIntelStatus?: "ok" | "missing_env" | "failed" | "skipped";
  gmailIntelRawItemCount?: number;
  gmailIntelItemsSentToAI?: number;
  gmailIntelSignalsCount?: number;
  gmailIntelQualifiedSignalCount?: number;
  rssRawItemCount?: number;
  rssItemsSentToAI?: number;
  rssSignalsCount?: number;
  rssQualifiedSignalCount?: number;
  aiSignalsCount?: number;
  aiProvider?: string;
  aiTriageUsed?: boolean;
  triageUsed?: boolean;
  aiTriageQualifiedCount?: number;
  finalAIReportUsed?: boolean;
  gmailIntelDiagnostics?: {
    status: "ok" | "missing_env" | "failed" | "skipped";
    rawItemCount?: number;
    curatedKeepCount: number;
    itemsSentToAI: number;
    signalsCount: number;
    qualifiedSignalCount?: number;
  };
  keySignals: KeySignal[];
  hrbpRecommendations: string[];
  thisWeekPattern?: string;
  web3AiBriefLines?: BriefLine[];
  hrbpBriefLines?: BriefLine[];
  employmentLaw?: EmploymentLawEmailBlock;
  expansionDownsizing?: AIReportContract["expansionDownsizing"];
  liveJobOpportunities?: LiveJobEmailRow[];
  skillsToPickUp?: SkillEmailRow[];
  learningAssets?: LearningEmailRow[];
};

function extractLocationFromLinkedInAlert(text: string): string | null {
  const t = text.replace(/\s{2,}/g, " ").trim();
  if (!t) return null;

  // Common email patterns: "Location: X" or "Location X" in summary blocks.
  const m1 = t.match(/\bLocation\b\s*[:\-–]\s*([A-Za-z][^.|,\n]{0,60})/i);
  if (m1?.[1]) return m1[1].trim();

  // Heuristic: look for "in <place>" close to the start.
  const head = t.slice(0, 320);
  const m2 = head.match(/\b(in|across)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\b/);
  if (m2?.[2]) return m2[2].trim();

  return null;
}

function extractFirstRealUrlFromText(text: string): string | undefined {
  const m = text.match(/https?:\/\/[^\s\])"'<>]+/i);
  if (!m?.[0]) return undefined;
  const u = m[0].trim();
  return isRealJobApplyUrl(u) ? u : undefined;
}

function ctxJobToHistoricalLink(j: Record<string, unknown>, idx: number): HistoricalJobLink | null {
  const applyUrl = typeof j.applyUrl === "string" ? j.applyUrl.trim() : "";
  if (!isRealJobApplyUrl(applyUrl)) return null;
  const fitScore = typeof j.fitScore === "number" ? j.fitScore : 0;
  const applicationStatus: HistoricalJobLink["applicationStatus"] = "To Review";
  return {
    id: typeof j.id === "string" ? j.id : `ctx-job-${idx}`,
    role: String(j.role ?? "Role"),
    company: String(j.company ?? "Unknown"),
    location: String(j.location ?? ""),
    source: String(j.source ?? "Job source"),
    applyUrl,
    dateFound: typeof j.dateFound === "string" ? j.dateFound : new Date().toISOString(),
    fitScore,
    applicationStatus,
    whyThisFits: String(j.whyThisFits ?? `${fitScore}/100 fit`),
    gaps: Array.isArray(j.gaps) ? (j.gaps as unknown[]).filter((g): g is string => typeof g === "string") : [],
    recommendedAction: String(j.recommendedAction ?? "Review listing and decide whether to apply."),
  };
}

function buildJobDefaultsFromCtx(rows: Record<string, unknown>[]): HistoricalJobLink[] {
  const out: HistoricalJobLink[] = [];
  let i = 0;
  for (const r of rows) {
    const mapped = ctxJobToHistoricalLink(r, i++);
    if (mapped) out.push(mapped);
  }
  return out.sort((a, b) => b.fitScore - a.fitScore).slice(0, 12);
}

function briefLineFromSignal(s: CleanMarketSignal): BriefLine {
  return {
    title: s.title,
    whatHappened: s.summary?.slice(0, 280) ?? s.title,
    whyItMatters: s.whyItMatters,
    hrbpImplication: s.hrbpImplication,
    suggestedAction: "Pressure-test one workforce or operating decision this signal should influence this week.",
    sourceName: s.sourceName,
    sourceUrl: s.url?.trim() ? s.url : undefined,
  };
}

function web3AiBriefLinesFromMixed(signals: CleanMarketSignal[]): BriefLine[] {
  return signals.slice(0, 3).map(briefLineFromSignal);
}

function hrbpBriefLinesFromMixed(signals: CleanMarketSignal[]): BriefLine[] {
  return signals.slice(0, 3).map(briefLineFromSignal);
}

function weeklyPatternFromSummary(w: Awaited<ReturnType<typeof getWeeklySummary>> | null): string {
  if (!w || w.status !== "ok" || w.runCount === 0) return "";
  const themes = w.topThemes
    .slice(0, 5)
    .map((t) => `${t.theme} (${t.count})`)
    .join(", ");
  const companies = w.repeatedCompanies
    .slice(0, 3)
    .map((c) => `${c.company}×${c.count}`)
    .join(", ");
  const parts = [
    `Runs (window): ${w.runCount}. Live jobs (deduped): ${w.liveJobsTotalDeduped}.`,
    themes ? `Top themes: ${themes}.` : "",
    companies ? `Repeated companies: ${companies}.` : "",
    w.importedLinkedInJobCount ? `LinkedIn Job Alert imports: ${w.importedLinkedInJobCount}.` : "",
    w.expansionVsDownsizingTrend ? `Expansion vs downsizing: ${w.expansionVsDownsizingTrend}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function mapAIReportContractToIntelligenceReport(
  contract: AIReportContract,
  generatedAt: string,
  thisWeekPattern?: string,
): IntelligenceReport {
  const headlines = contract.marketBriefs.map((b) => b.headline).filter(Boolean);
  const headline =
    headlines.length <= 1
      ? (headlines[0] ?? "SWIFT intelligence summary")
      : headlines.slice(0, 2).join(" · ");

  const keySignals: KeySignal[] = [];
  const web3AiBriefLines: BriefLine[] = [];
  const hrbpBriefLines: BriefLine[] = [];
  for (const brief of contract.marketBriefs) {
    for (const s of brief.keySignals) {
      keySignals.push({
        title: s.title,
        source: s.sourceName,
        implication: s.hrbpImplication,
        sourceUrl: typeof s.sourceUrl === "string" && s.sourceUrl.trim() ? s.sourceUrl.trim() : undefined,
      });
      const line: BriefLine = {
        title: s.title,
        whatHappened: (s.whatHappened ?? s.title).trim(),
        whyItMatters: s.whyItMatters,
        hrbpImplication: s.hrbpImplication,
        suggestedAction: s.recommendedAction,
        sourceName: s.sourceName,
        sourceUrl: typeof s.sourceUrl === "string" && s.sourceUrl.trim() ? s.sourceUrl.trim() : undefined,
      };
      if (brief.category === "web3_ai") web3AiBriefLines.push(line);
      else hrbpBriefLines.push(line);
    }
  }

  const hrbpRecommendations: string[] = [];
  for (const brief of contract.marketBriefs) {
    for (const s of brief.keySignals) {
      if (s.recommendedAction && !hrbpRecommendations.includes(s.recommendedAction)) {
        hrbpRecommendations.push(s.recommendedAction);
      }
    }
  }
  for (const sk of contract.skillsToPickUp) {
    if (sk.nextAction && !hrbpRecommendations.includes(sk.nextAction)) {
      hrbpRecommendations.push(sk.nextAction);
    }
  }
  if (contract.expansionDownsizing?.suggestedHrbpAction) {
    hrbpRecommendations.push(contract.expansionDownsizing.suggestedHrbpAction);
  }
  for (const it of contract.employmentLaw.items) {
    if (it.suggestedAction && !hrbpRecommendations.includes(it.suggestedAction)) {
      hrbpRecommendations.push(it.suggestedAction);
    }
  }

  if (hrbpRecommendations.length === 0) {
    hrbpRecommendations.push(
      "Turn the executive summary into a short decision memo: what changes, what stays, what to monitor.",
    );
  }

  const liveJobOpportunities: LiveJobEmailRow[] = contract.jobOpportunities.slice(0, 5).map((j) => ({
    role: j.role,
    company: j.company,
    location: j.location,
    source: j.source,
    fitScore: j.fitScore,
    applyUrl: j.applyUrl,
    sourceUrl: undefined,
    whyThisFits: j.whyThisFits,
  }));

  const skillsToPickUp: SkillEmailRow[] = contract.skillsToPickUp.slice(0, 3).map((s) => ({
    skill: s.skill,
    priorityScore: s.priority,
    whyNow: s.evidence,
    nextAction: s.nextAction,
  }));

  const learningAssets: LearningEmailRow[] = contract.learningAssetRecommendations.slice(0, 3).map((a) => ({
    topic: a.topic,
    format: a.format,
    whyNow: a.reason,
    linkedSkill: a.linkedSkill,
    intendedOutput: a.nextAction,
  }));

  return {
    generatedAt,
    headline,
    executiveSummary: contract.executiveSummary,
    keySignals: keySignals.length > 0 ? keySignals.slice(0, 12) : keySignals,
    hrbpRecommendations: hrbpRecommendations.slice(0, 12),
    thisWeekPattern: thisWeekPattern?.trim() || undefined,
    employmentLaw: {
      headline: contract.employmentLaw.headline,
      disclaimer: contract.employmentLaw.disclaimer,
      items: contract.employmentLaw.items.map((it) => ({
        title: it.title,
        whatChanged: it.whatChanged,
        whyItMatters: it.whyItMatters,
        hrbpImplication: it.hrbpImplication,
        suggestedAction: it.suggestedAction,
        sourceName: it.sourceName,
        sourceUrl: it.sourceUrl?.trim() ? it.sourceUrl : undefined,
        jurisdiction: it.jurisdiction,
        lawTheme: it.lawTheme,
        confidence: it.confidence,
        whyItQualifies: it.whyItQualifies,
      })),
    },
    expansionDownsizing: contract.expansionDownsizing,
    web3AiBriefLines: web3AiBriefLines.slice(0, 4),
    hrbpBriefLines: hrbpBriefLines.slice(0, 4),
    liveJobOpportunities,
    skillsToPickUp,
    learningAssets,
  };
}

function buildRulesBasedReport(
  cleanedSignals: CleanMarketSignal[],
  generatedAt: string,
  extras: {
    weeklyPattern: string;
    jobRows: LiveJobEmailRow[];
    skills: SkillEmailRow[];
    learning: LearningEmailRow[];
  },
): IntelligenceReport {
  const topSignals = cleanedSignals.slice(0, 5);
  const det = buildDeterministicContractIntel(cleanedSignals);

  const keySignals: KeySignal[] = topSignals.map((s) => ({
    title: s.title,
    source: s.sourceName,
    implication: s.hrbpImplication,
    sourceUrl: s.url?.trim() ? s.url : undefined,
  }));

  const web3Lines = cleanedSignals
    .filter((s) => s.category === "web3_ai")
    .slice(0, 3)
    .map(briefLineFromSignal);
  const hrbpLines = cleanedSignals
    .filter((s) => s.category === "hrbp")
    .slice(0, 3)
    .map(briefLineFromSignal);

  const recommendations: string[] = [
    "Translate the top market signals into 1–2 operating model decisions for leaders this week.",
    "Rules-based baseline (DeepSeek unavailable or returned no valid JSON).",
  ];

  return {
    generatedAt,
    headline: `Live RSS signals detected (${cleanedSignals.length}) — deterministic HRBP read.`,
    executiveSummary: `This report ingested ${cleanedSignals.length} cleaned RSS signals. ${
      extras.weeklyPattern || "Weekly repository snapshot not available or empty."
    } Use the Expansion & Downsizing and Employment Law blocks for keyword-scanned implications from the same ingest — not legal advice.`,
    gmailIntelStatus: undefined,
    gmailIntelSignalsCount: undefined,
    rssSignalsCount: cleanedSignals.length,
    aiSignalsCount: cleanedSignals.length,
    aiProvider: "deterministic",
    keySignals,
    hrbpRecommendations: recommendations,
    web3AiBriefLines: web3Lines.length ? web3Lines : web3AiBriefLinesFromMixed(cleanedSignals),
    hrbpBriefLines: hrbpLines.length ? hrbpLines : hrbpBriefLinesFromMixed(cleanedSignals),
    employmentLaw: {
      headline: det.employmentLaw.headline,
      disclaimer: det.employmentLaw.disclaimer,
      items: det.employmentLaw.items,
    },
    expansionDownsizing: det.expansionDownsizing,
    thisWeekPattern: extras.weeklyPattern || undefined,
    liveJobOpportunities: extras.jobRows.slice(0, 5),
    skillsToPickUp: extras.skills.slice(0, 3),
    learningAssets: extras.learning.slice(0, 3),
  };
}

export type ReportStorageContextPayload = Awaited<
  ReturnType<typeof gatherReportStorageContext>
>;

/**
 * When `storageContext` is passed (e.g. manual run), RSS + jobs + LinkedIn imports are not fetched again here.
 */
export async function generateReport(options?: {
  storageContext?: ReportStorageContextPayload;
}): Promise<IntelligenceReport> {
  const pre = options?.storageContext;

  // Start Gmail Intel pipeline early; never blocks the rest.
  const dmPromise = (async () => {
    try {
      return await runDailyMarketPipeline();
    } catch {
      return null;
    }
  })();

  const [weekly, skillsLearning, ingestBundle] = await Promise.all([
    getWeeklySummary(7).catch(() => null),
    getLiveSkillsAndLearning().catch(() => null),
    pre
      ? Promise.resolve({
          cleanedSignals: pre.marketSignals as unknown as CleanMarketSignal[],
          ctx: pre,
        })
      : (async () => {
          const { getCleanedMarketSignals } = await import("@/lib/rssIngestion");
          const [cleanedSignals, ctx] = await Promise.all([
            getCleanedMarketSignals(),
            gatherReportStorageContext().catch(() => null),
          ]);
          return { cleanedSignals, ctx };
        })(),
  ]);

  const { cleanedSignals, ctx } = ingestBundle;

  const generatedAt = new Date().toISOString();
  const weeklyPattern = weeklyPatternFromSummary(weekly);
  const jobDefaults = buildJobDefaultsFromCtx(ctx?.jobOpportunities ?? []);

  const hasGmailCreds = Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());

  const dm = await dmPromise;

  const gmailIntelStatus: IntelligenceReport["gmailIntelStatus"] = !hasGmailCreds
    ? "missing_env"
    : dm
      ? dm.deterministicCandidateCount > 0
        ? "ok"
        : "skipped"
      : "failed";

  const gmailIntelSignals: CleanMarketSignal[] = (() => {
    if (!dm) return [];
    // AI-first: do NOT require keep/drop curation before triage.
    // We only apply minimal safety filtering + caps here.
    const raw = Object.values(dm.articlesBySection)
      .flat()
      .filter((a) => a && typeof a.title === "string" && a.title.trim())
      .filter((a) => typeof a.url === "string" && /^https?:\/\//i.test(a.url))
      .filter((a) => !/linkedin\.com/i.test(String(a.url ?? "")));

    const sectionToCategory = (s: string): CleanMarketSignal["category"] =>
      s === "ai_market" || s === "web3_market" ? "web3_ai" : "hrbp";

    const cap = 40;
    const seen = new Set<string>();
    const out: CleanMarketSignal[] = [];
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i]!;
      const title = String(a.title ?? "").trim();
      const url = String(a.resolvedUrl ?? a.url ?? "").trim();
      const key = `${title.toLowerCase().slice(0, 160)}|${url.toLowerCase()}`;
      if (!title || !url) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `gmail-${i}-${url.slice(-18)}`,
        title,
        sourceName: `Gmail SWIFT Intel · ${a.source ?? a.resolvedSource ?? "news.google.com"}`,
        url,
        publishedAt: a.publishedAt,
        category: sectionToCategory(String(a.sectionKey ?? "hrbp_leadership")),
        tags: [
          "source:gmail_swift_intel",
          "sourceType:gmail_swift_intel",
          "sourcePriority:primary",
          String(a.sectionKey ?? ""),
          String(a.contentQuality ?? "title_only"),
        ].filter(Boolean),
        relevanceScore: Math.max(0, Math.min(100, a.relevanceScore ?? 50)),
        signalStrength:
          a.contentQuality === "full_text"
            ? "Strong"
            : a.contentQuality === "rss_snippet"
              ? "Moderate"
              : "Weak",
        summary: (a.textForAI?.trim() || a.aiArticleSummary?.trim() || a.rssSnippet?.trim() || title).slice(0, 900),
        whyItMatters: "Primary-source raw Gmail Intel candidate (AI triage decides inclusion).",
        hrbpImplication: "AI triage will infer HRBP implications; treat this as evidence input only.",
      });
      if (out.length >= cap) break;
    }
    return out;
  })();

  const rssSignals: CleanMarketSignal[] = (cleanedSignals ?? []).map((s) => {
    const tags = Array.isArray(s.tags) ? s.tags : [];
    const hasSourceTag = tags.some((t) => typeof t === "string" && t.startsWith("source:"));
    const nextTags = hasSourceTag ? tags : [...tags, "source:rss"];
    const srcName = String(s.sourceName ?? "");
    const nextSourceName = srcName.startsWith("Gmail SWIFT Intel ·") || srcName.startsWith("RSS ·")
      ? srcName
      : `RSS · ${srcName || "source"}`;
    return { ...s, tags: nextTags, sourceName: nextSourceName };
  });

  const gmailIntelRawItemCount = dm?.deterministicCandidateCount ?? undefined;
  const gmailIntelCuratedKeepCount = dm ? Object.values(dm.articlesBySection).flat().filter((a) => a.keep).length : 0;
  const buildGmailIntelDiagnostics = (qualifiedSignalCount?: number): NonNullable<IntelligenceReport["gmailIntelDiagnostics"]> => ({
    status: gmailIntelStatus,
    rawItemCount: gmailIntelRawItemCount,
    curatedKeepCount: gmailIntelCuratedKeepCount,
    itemsSentToAI: gmailIntelSignals.length,
    signalsCount: gmailIntelSignals.length,
    qualifiedSignalCount,
  });

  console.info("[generate_report] gmail intel curation", {
    gmailCandidates: gmailIntelRawItemCount ?? 0,
    curatedKeepCount: gmailIntelCuratedKeepCount,
    sentToAI: gmailIntelSignals.length,
  });

  console.info("[generate_report] signal inputs", {
    gmailIntelStatus,
    gmailIntelSignals: gmailIntelSignals.length,
    rssSignals: rssSignals.length,
  });

  const employmentLawFallbackFromDm = (() => {
    const law = dm?.articlesBySection?.employment_law ?? [];
    // Only use curated "keep" items; avoid dumping weak/noisy headlines into Employment Law.
    const selected = law.filter((a) => Boolean(a.keep)).slice(0, 12);
    if (selected.length === 0) return null;
    return {
      headline: "Employment law signals (from SWIFT Employment Law Trends)",
      disclaimer:
        "Derived from Gmail Intel source items when the AI report block is empty. Not legal advice.",
      items: selected.slice(0, 10).map((a) => ({
        title: a.title,
        whatChanged: a.contentPreview?.trim() ? a.contentPreview.trim() : a.title,
        whyItMatters: (a.rssSnippet?.trim() || a.aiArticleSummary?.trim() || a.textForAI).slice(0, 700),
        hrbpImplication:
          "Assess workforce impact, policy exposure, and comms/consultation readiness.",
        suggestedAction:
          "Flag to Legal/ER; validate jurisdiction and applicability; update playbooks if needed.",
        sourceName: a.source ?? a.resolvedSource ?? "Gmail Intel",
        sourceUrl: (a.resolvedUrl ?? a.url).trim(),
      })),
    };
  })();

  const gmailLinkedInAlerts = await fetchLinkedInJobAlertEmails().catch(() => []);
  const gmailLinkedInRows: LiveJobEmailRow[] = (() => {
    const rows: LiveJobEmailRow[] = [];
    const seenJobKeys = new Set<string>();

    const jobKeyFromUrl = (u: string): string => {
      try {
        const parsed = new URL(u);
        const path = parsed.pathname;
        const m = path.match(/\/jobs\/view\/(\d+)/i) ?? path.match(/\/comm\/jobs\/view\/(\d+)/i);
        return m?.[1] ? `job:${m[1]}` : `url:${parsed.toString().toLowerCase()}`;
      } catch {
        return `url:${u.toLowerCase()}`;
      }
    };

    for (const email of (gmailLinkedInAlerts ?? []).slice(0, 10)) {
      const location = extractLocationFromLinkedInAlert(email.text) ?? "Location from LinkedIn alert";

      const preferred: string[] = [];
      if (typeof email.primaryUrl === "string" && isRealJobApplyUrl(email.primaryUrl)) {
        preferred.push(email.primaryUrl);
      }
      if (Array.isArray(email.urls)) {
        for (const u of email.urls) {
          if (typeof u === "string" && isRealJobApplyUrl(u)) preferred.push(u);
        }
      }
      if (preferred.length === 0) {
        const fallback = extractFirstRealUrlFromText(email.text);
        if (fallback) preferred.push(fallback);
      }

      // If we have multiple job URLs, emit separate rows per distinct job id when possible.
      const urlsToEmit = preferred.length > 0 ? preferred : [undefined];
      for (const u of urlsToEmit) {
        const url = typeof u === "string" && isRealJobApplyUrl(u) ? u : undefined;
        const key = url ? jobKeyFromUrl(url) : `email:${(email.subject ?? "").toLowerCase()}|no-url`;
        if (seenJobKeys.has(key)) continue;
        seenJobKeys.add(key);
        rows.push({
          role: email.subject || "LinkedIn job alert",
          company: "LinkedIn Job Alerts",
          location,
          source: "LinkedIn Gmail Alert",
          fitScore: 85,
          applyUrl: url,
          sourceUrl: url,
          whyThisFits:
            "Saved LinkedIn Job Alert matching your SWIFT Web3 × AI HRBP search; open the alert email to review role details and apply.",
        });
        if (rows.length >= 12) break;
      }
      if (rows.length >= 12) break;
    }
    return rows;
  })();

  const jobRows: LiveJobEmailRow[] = (ctx?.jobOpportunities ?? [])
    .flatMap((r) => {
      const apply = typeof r.applyUrl === "string" ? r.applyUrl : "";
      const src = typeof r.sourceUrl === "string" ? r.sourceUrl : "";
      const href = isRealJobApplyUrl(apply) ? apply : src;
      if (!isRealJobApplyUrl(href)) return [];
      const row: LiveJobEmailRow = {
        role: String(r.role ?? "Role"),
        company: String(r.company ?? "Unknown"),
        location: String(r.location ?? ""),
        source: String(r.source ?? "Job source"),
        fitScore: typeof r.fitScore === "number" ? r.fitScore : 0,
        applyUrl: isRealJobApplyUrl(apply) ? apply : undefined,
        sourceUrl: src && src !== apply ? src : undefined,
        whyThisFits: String(r.whyThisFits ?? ""),
      };
      return [row];
    })
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 12);

  const mergedJobRows: LiveJobEmailRow[] = [...gmailLinkedInRows, ...jobRows].slice(0, 12);

  const skills: SkillEmailRow[] = (skillsLearning?.skills ?? []).slice(0, 5).map((s) => ({
    skill: s.title,
    priorityScore: `${s.priority} (${s.priorityScore}/100)`,
    whyNow: s.whyItMatters,
    nextAction: s.suggestedAction,
  }));

  const learning: LearningEmailRow[] = (skillsLearning?.learningAssets ?? []).slice(0, 5).map((a) => ({
    topic: a.title,
    format: a.format,
    whyNow: a.whyNow,
    linkedSkill: a.linkedSkills[0],
    intendedOutput: a.intendedOutput,
  }));

  const extras = { weeklyPattern, jobRows: mergedJobRows, skills, learning };

  const mergedSignals = [...gmailIntelSignals, ...rssSignals];

  if (mergedSignals.length > 0) {
    const useDeepSeek = shouldUseDeepSeek();
    console.info("[generate_report] generating dashboard report", {
      mergedSignalsCount: mergedSignals.length,
      useDeepSeek,
    });

    if (shouldUseDeepSeek()) {
      console.info("[generate_report] ai triage started");
      const triageResult = await triageSignalsWithDeepSeekResult({
        cleanedSignals: mergedSignals,
        generatedAt,
      });
      const triage = triageResult.ok ? triageResult.triage : null;
      const triageUsed = Boolean(triage);
      if (!triageUsed) {
        // Safe diagnostics only (no secrets, no payload dump).
        console.warn("[generate_report] ai triage failed", {
          apiStatus: triageResult.diagnostics.apiStatus,
          apiErrorMessage: triageResult.diagnostics.apiErrorMessage,
          parseError: triageResult.diagnostics.parseError,
          validationMissingFields: triageResult.diagnostics.validationMissingFields,
          modelsAttempted: triageResult.diagnostics.modelsAttempted,
        });
      }
      let qualifiedSignals: CleanMarketSignal[] = mergedSignals;
      let gmailIntelQualified = gmailIntelSignals.length;
      let rssQualified = rssSignals.length;

      if (triageUsed) {
        const byId = new Map(triage!.items.map((t) => [t.id, t]));
        // AI-first: only include items explicitly selected by triage.
        qualifiedSignals = mergedSignals
          .map((s) => ({ s, t: byId.get(s.id) }))
          .filter((x) => x.t?.includeInCards && x.t.isQualifiedSignal)
          .sort((a, b) => (b.t?.strategicRelevance ?? 0) - (a.t?.strategicRelevance ?? 0))
          .slice(0, 26)
          .map((x) => x.s);
        if (qualifiedSignals.length === 0) {
          // Guardrail: never allow an empty qualified set to produce an empty dashboard.
          qualifiedSignals = mergedSignals.slice(0, 12);
        }

        const isGmail = (sig: CleanMarketSignal) =>
          Array.isArray(sig.tags) && sig.tags.some((t) => typeof t === "string" && t === "source:gmail_swift_intel");
        gmailIntelQualified = qualifiedSignals.filter(isGmail).length;
        rssQualified = qualifiedSignals.length - gmailIntelQualified;
      }
      console.info("[generate_report] ai triage completed", {
        triageUsed,
        qualifiedSignalCount: qualifiedSignals.length,
        excludedSignalCount: mergedSignals.length - qualifiedSignals.length,
      });

      console.info("[generate_report] deepseek generation started");
      const aiContract = await generateDeepSeekReport({
        cleanedSignals: qualifiedSignals,
        generatedAt,
        jobOpportunityDefaults: jobDefaults,
        weeklyPattern,
      });
      if (aiContract) {
        console.info("[generate_report] deepseek generation succeeded");
        const mapped = mapAIReportContractToIntelligenceReport(aiContract, generatedAt, weeklyPattern);
        if (
          employmentLawFallbackFromDm &&
          (!mapped.employmentLaw?.items || mapped.employmentLaw.items.length === 0)
        ) {
          mapped.employmentLaw = employmentLawFallbackFromDm;
        }
        return {
          ...mapped,
          gmailIntelStatus,
          gmailIntelRawItemCount,
          gmailIntelItemsSentToAI: gmailIntelSignals.length,
          gmailIntelSignalsCount: gmailIntelSignals.length,
          gmailIntelQualifiedSignalCount: gmailIntelQualified,
          gmailIntelDiagnostics: buildGmailIntelDiagnostics(gmailIntelQualified),
          rssRawItemCount: rssSignals.length,
          rssItemsSentToAI: rssSignals.length,
          rssSignalsCount: rssSignals.length,
          rssQualifiedSignalCount: rssQualified,
          aiSignalsCount: qualifiedSignals.length,
          aiProvider: "deepseek",
          aiTriageUsed: triageUsed,
          triageUsed,
          aiTriageQualifiedCount: qualifiedSignals.length,
          finalAIReportUsed: true,
          liveJobOpportunities: [...gmailLinkedInRows, ...(mapped.liveJobOpportunities ?? [])].slice(0, 12),
        };
      }
      console.info("[generate_report] deepseek returned no usable contract; falling back");

      // If triage succeeded but final report failed/timed out, we still want:
      // - diagnostics to show triage influence
      // - deterministic fallback to run on the triaged subset (not the full raw set)
      const detFromQualified = buildRulesBasedReport(qualifiedSignals, generatedAt, extras);
      if (
        employmentLawFallbackFromDm &&
        (!detFromQualified.employmentLaw?.items || detFromQualified.employmentLaw.items.length === 0)
      ) {
        detFromQualified.employmentLaw = employmentLawFallbackFromDm;
      }
      return {
        ...detFromQualified,
        gmailIntelStatus,
        gmailIntelRawItemCount,
        gmailIntelItemsSentToAI: gmailIntelSignals.length,
        gmailIntelSignalsCount: gmailIntelSignals.length,
        gmailIntelQualifiedSignalCount: gmailIntelQualified,
        gmailIntelDiagnostics: buildGmailIntelDiagnostics(gmailIntelQualified),
        rssRawItemCount: rssSignals.length,
        rssItemsSentToAI: rssSignals.length,
        rssSignalsCount: rssSignals.length,
        rssQualifiedSignalCount: rssQualified,
        aiSignalsCount: qualifiedSignals.length,
        aiProvider: "deterministic",
        aiTriageUsed: triageUsed,
        triageUsed,
        aiTriageQualifiedCount: qualifiedSignals.length,
        finalAIReportUsed: false,
      };
    }

    console.info("[generate_report] using deterministic rules-based report fallback");
    const det = buildRulesBasedReport(mergedSignals, generatedAt, extras);
    if (
      employmentLawFallbackFromDm &&
      (!det.employmentLaw?.items || det.employmentLaw.items.length === 0)
    ) {
      det.employmentLaw = employmentLawFallbackFromDm;
    }
    return {
      ...det,
      gmailIntelStatus,
      gmailIntelRawItemCount,
      gmailIntelItemsSentToAI: gmailIntelSignals.length,
      gmailIntelSignalsCount: gmailIntelSignals.length,
      gmailIntelQualifiedSignalCount: gmailIntelSignals.length,
      gmailIntelDiagnostics: buildGmailIntelDiagnostics(gmailIntelSignals.length),
      rssRawItemCount: rssSignals.length,
      rssItemsSentToAI: rssSignals.length,
      rssSignalsCount: rssSignals.length,
      aiSignalsCount: mergedSignals.length,
      aiProvider: "deterministic",
      aiTriageUsed: false,
      triageUsed: false,
      finalAIReportUsed: false,
    };
  }

  const mockSignals: KeySignal[] = [
    {
      title: "AI-native operating models are moving from experiment to execution",
      source: "Mock signal",
      implication:
        "HRBPs need to help leaders define what work should be automated, augmented, or kept human-led.",
    },
  ];

  return {
    generatedAt,
    headline:
      "Web3 x AI hiring is shifting from hype-driven expansion to operator-led execution.",
    executiveSummary:
      "No live RSS signals were ingested in this run. Connect sources in the registry, then re-run. Mock content below is placeholder only.",
    keySignals: mockSignals,
    hrbpRecommendations: [
      "Build a critical capability map for AI, compliance, product, and growth roles.",
      "Help leaders separate work that can be automated from work requiring judgment, trust, and stakeholder navigation.",
    ],
    thisWeekPattern: weeklyPattern || undefined,
    liveJobOpportunities: mergedJobRows.slice(0, 5),
    skillsToPickUp: skills.slice(0, 3),
    learningAssets: learning.slice(0, 3),
  };
}
