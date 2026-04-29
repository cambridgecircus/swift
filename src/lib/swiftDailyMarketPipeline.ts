import type { DailyMarketIntelEmail, DailyMarketIntelItem, DailyMarketIntelSection } from "@/lib/gmailDailyMarketIntel";
import { fetchDailyMarketIntelEmails } from "@/lib/gmailDailyMarketIntel";
import { extractArticlesFromGmailIntel } from "@/lib/gmailIntelArticleParser";
import { aiCleanAndStructureGmailIntel, aiReadGmailIntelAndExtractArticleBodies } from "@/lib/gmailIntelAi";
import type { ArticleCandidate, CuratedArticle, EnrichedArticle } from "@/lib/swiftArticleTypes";
import { isAiConfigured } from "@/lib/aiProvider";
import { isLikelyArticleUrl, resolveGoogleNewsUrl } from "@/lib/dailyMarketArticleFetcher";
import { aiCurateSourcesForSwiftReport } from "@/lib/swiftAiCuration";

type PipelineStats = {
  totalSelected: number;
  fullTextCount: number;
  aiExtractedGmailBodyCount: number;
  partialGmailContextCount: number;
  rssSnippetCount: number;
  titleOnlyCount: number;
  resolvedOkCount: number;
  fetchedOkCount: number;

  aiBodyExtractionAttempted: boolean;
  aiBodyExtractionSuccessCount: number;
  aiBodyExtractionPartialCount: number;
  aiBodyExtractionNotFoundCount: number;
  aiBodyExtractionFailedCount: number;

  aiCleanedCount: number;
  aiCuratedKeepCount: number;
  aiCuratedRejectedCount: number;
  rejectedNonArticleCount: number;
  rejectedAssetCount: number;
  topRejectedReasons: Array<{ reason: string; count: number }>;
};

export type DailyMarketDebugPipelineResult = {
  generatedAt: string;
  sourceEmailSubject?: string;
  sourceEmailDate?: string;
  rawEmailBodyLength: number;
  deterministicCandidateCount: number;
  aiConfigured: boolean;
  stats: PipelineStats;
  articlesBySection: Record<DailyMarketIntelSection, CuratedArticle[]>;
  errors: {
    aiBodyExtraction?: string | null;
    aiCleanup?: string | null;
    aiCuration?: string | null;
  };
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SWIFT/1.0 (Daily Market Intel fetcher)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

function stripHtmlTagsOnly(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractReadableFromHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ");

  const pick = (re: RegExp): string | null => {
    const m = cleaned.match(re);
    if (!m?.[1]) return null;
    const t = stripHtmlTagsOnly(m[1]);
    return t || null;
  };

  const fromArticle = pick(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (fromArticle) return fromArticle;
  const fromMain = pick(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (fromMain) return fromMain;
  const fromBody = pick(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (fromBody) return fromBody;
  return stripHtmlTagsOnly(cleaned);
}

function clampText(text: string, maxChars = 8000): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= maxChars ? t : `${t.slice(0, maxChars)}…`;
}

function textForAiBase(a: ArticleCandidate, urlLine: string, contentQuality: string): string {
  const parts = [
    a.title,
    `Source: ${a.source ?? "source"}`,
    a.publishedAt ? `PublishedAt: ${a.publishedAt}` : "",
    a.query ? `Query: ${a.query}` : "",
    urlLine,
    `Content quality: ${contentQuality}`,
  ].filter(Boolean);
  return parts.join("\n");
}

function looksLikeBadPage(text: string): boolean {
  const t = text.toLowerCase();
  const hits = ["cookie", "privacy", "terms", "license", "documentation", "docs", "sign in", "login", "accept all"].filter((k) =>
    t.includes(k),
  ).length;
  return hits >= 4;
}

async function enrichOne(
  c: ArticleCandidate,
  rejectedReasons: Map<string, number>,
  counters: { rejectedNonArticle: number; rejectedAsset: number; resolvedOk: number; fetchedOk: number },
): Promise<EnrichedArticle> {
  const bump = (r: string) => rejectedReasons.set(r, (rejectedReasons.get(r) ?? 0) + 1);
  const originalUrl = c.url;
  const safeSource = c.source ?? "news.google.com";

  const resolved = await resolveGoogleNewsUrl(originalUrl, c.title).catch(() => ({
    resolvedUrl: originalUrl,
    resolvedOk: false,
    resolvedSource: "news.google.com",
    rejectedAssetCount: 0,
    rejectedNonArticleCount: 0,
    rejectedPublisherMismatchCount: 0,
  }));

  counters.rejectedAsset += resolved.rejectedAssetCount ?? 0;
  counters.rejectedNonArticle += resolved.rejectedNonArticleCount ?? 0;

  const resolvedOk = Boolean(resolved.resolvedOk && isLikelyArticleUrl(resolved.resolvedUrl));
  if (resolvedOk) counters.resolvedOk += 1;

  const base: EnrichedArticle = {
    ...c,
    source: safeSource,
    resolvedUrl: resolved.resolvedUrl,
    resolvedSource: resolved.resolvedSource,
    resolvedOk,
    fetchedOk: false,
    contentQuality: "title_only",
    textForAI: "",
    error: null,
  };

  // 1) Try full-text fetch only when resolvedOk is true.
  if (resolvedOk && resolved.resolvedUrl) {
    try {
      const res = await fetchWithTimeout(resolved.resolvedUrl, 9000);
      if (!res.ok) {
        bump(`article_fetch_failed:HTTP_${res.status}`);
      } else {
        const ct = (res.headers.get("content-type") ?? "").toLowerCase();
        const body = await res.text();
        const text = ct.includes("text/html") || body.includes("<html") ? extractReadableFromHtml(body) : body;
        const cleaned = text.replace(/\s+/g, " ").trim();
        if (cleaned.length < 800) {
          bump("content_too_short");
        } else if (looksLikeBadPage(cleaned)) {
          bump("bad_page_boilerplate");
        } else {
          const content = clampText(cleaned, 8000);
          counters.fetchedOk += 1;
          return {
            ...base,
            fetchedOk: true,
            contentQuality: "full_text",
            contentPreview: content,
            contentLength: cleaned.length,
            textForAI: `${textForAiBase(c, `URL: ${resolved.resolvedUrl}`, "full_text")}\n\n${content}`,
            error: null,
          };
        }
      }
    } catch (e) {
      bump(e instanceof Error ? e.message : "article_fetch_failed");
    }
  } else {
    bump("google_news_resolution_failed");
  }

  // 2) AI-extracted Gmail body fallback
  const body = (c.aiExtractedArticleBody ?? "").trim();
  const summary = (c.aiArticleSummary ?? "").trim();
  if (body && c.aiBodyExtractionStatus === "extracted_from_gmail") {
    return {
      ...base,
      contentQuality: "ai_extracted_gmail_body",
      fetchedOk: false,
      textForAI:
        `${textForAiBase(c, `Original URL: ${originalUrl}`, "ai_extracted_gmail_body")}\n` +
        `${base.resolvedUrl && base.resolvedUrl !== originalUrl ? `Resolved URL: ${base.resolvedUrl}\n` : ""}` +
        `${summary ? `AI summary (from Gmail): ${summary}\n` : ""}` +
        `AI extracted body (from Gmail): ${body}\n` +
        `Note: External article full text could not be fetched. This content was extracted by AI from the Gmail Intel email body.`,
      error: "ai_extracted_gmail_body_fallback",
    };
  }

  // 3) Partial context fallback
  const surrounding = (c.surroundingText ?? "").trim();
  if (surrounding && (c.aiBodyExtractionStatus === "partial_from_gmail" || summary)) {
    return {
      ...base,
      contentQuality: "partial_gmail_context",
      fetchedOk: false,
      textForAI:
        `${textForAiBase(c, `Original URL: ${originalUrl}`, "partial_gmail_context")}\n` +
        `${summary ? `AI summary (from Gmail): ${summary}\n` : ""}` +
        `Gmail surrounding context: ${clampText(surrounding, 1200)}\n` +
        `Note: Only partial Gmail Intel context was available.`,
      error: "partial_gmail_context_fallback",
    };
  }

  // 4) RSS snippet fallback
  const snippet = (c.rssSnippet ?? "").trim();
  if (snippet) {
    return {
      ...base,
      contentQuality: "rss_snippet",
      fetchedOk: false,
      textForAI:
        `${textForAiBase(c, `Original URL: ${originalUrl}`, "rss_snippet")}\n` +
        `RSS snippet: ${snippet}\n` +
        `${surrounding ? `Gmail surrounding context: ${clampText(surrounding, 800)}\n` : ""}` +
        `Note: Full article content could not be fetched; analyse from RSS snippet/title/context only.`,
      error: "rss_snippet_fallback",
    };
  }

  // 5) Title-only fallback
  return {
    ...base,
    contentQuality: "title_only",
    fetchedOk: false,
    textForAI: `${textForAiBase(c, `Original URL: ${originalUrl}`, "title_only")}\nNote: Only title/source metadata available.`,
    error: "title_only_fallback",
  };
}


export async function runDailyMarketPipeline(): Promise<DailyMarketDebugPipelineResult> {
  const generatedAt = new Date().toISOString();
  const zeroSections: Record<DailyMarketIntelSection, CuratedArticle[]> = {
    ai_market: [],
    web3_market: [],
    hrbp_leadership: [],
    employment_law: [],
    expansion_downsizing: [],
  };

  const intel = await fetchDailyMarketIntelEmails().catch(() => ({ generatedAt, emails: [] as DailyMarketIntelEmail[] }));
  const emailsSorted = (intel.emails ?? []).slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recent = emailsSorted.slice(0, 8);
  if (recent.length === 0) {
    return {
      generatedAt,
      sourceEmailSubject: undefined,
      sourceEmailDate: undefined,
      rawEmailBodyLength: 0,
      deterministicCandidateCount: 0,
      aiConfigured: isAiConfigured(),
      stats: {
        totalSelected: 0,
        fullTextCount: 0,
        aiExtractedGmailBodyCount: 0,
        partialGmailContextCount: 0,
        rssSnippetCount: 0,
        titleOnlyCount: 0,
        resolvedOkCount: 0,
        fetchedOkCount: 0,
        aiBodyExtractionAttempted: false,
        aiBodyExtractionSuccessCount: 0,
        aiBodyExtractionPartialCount: 0,
        aiBodyExtractionNotFoundCount: 0,
        aiBodyExtractionFailedCount: 0,
        aiCleanedCount: 0,
        aiCuratedKeepCount: 0,
        aiCuratedRejectedCount: 0,
        rejectedNonArticleCount: 0,
        rejectedAssetCount: 0,
        topRejectedReasons: [],
      },
      articlesBySection: zeroSections,
      errors: {},
    };
  }

  // Merge sections across several recent emails, so we don't miss e.g. "SWIFT Employment Law Trends"
  // when it arrives as a separate email from AI/Web3 briefs.
  const merged: Record<DailyMarketIntelSection, DailyMarketIntelItem[]> = {
    ai_market: [],
    web3_market: [],
    hrbp_leadership: [],
    employment_law: [],
    expansion_downsizing: [],
  };
  const seen = new Set<string>();
  for (const email of recent) {
    for (const [sec, items] of Object.entries(email.sections) as Array<[DailyMarketIntelSection, DailyMarketIntelItem[]]>) {
      for (const it of items ?? []) {
        const key = `${sec}||${(it.url || "").toLowerCase().trim()}||${(it.title || "").toLowerCase().trim().slice(0, 120)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged[sec].push(it);
      }
    }
  }

  // Deterministic proxy body with explicit section headings for parser reliability.
  const sectionHeading: Record<DailyMarketIntelSection, string> = {
    ai_market: "SWIFT AI Market Intel",
    web3_market: "SWIFT Web3 Market Intel",
    hrbp_leadership: "SWIFT HRBP Daily Brief",
    employment_law: "SWIFT Employment Law Trends",
    expansion_downsizing: "SWIFT Expansion & Downsizing Trends",
  };
  const rawEmailBody = (Object.keys(merged) as DailyMarketIntelSection[])
    .map((sec) => {
      const items = merged[sec] ?? [];
      if (items.length === 0) return "";
      const lines = items.slice(0, 40).map((i) => `${i.title}\n${i.url}\n${i.rssSnippet ?? ""}`.trim());
      return `${sectionHeading[sec]}\n${lines.join("\n\n")}`.trim();
    })
    .filter(Boolean)
    .join("\n\n\n");

  console.log("[daily-market] Gmail Intel emails used:", recent.map((e) => e.subject).join(" | "));
  console.log("[daily-market] raw email body length:", rawEmailBody.length);

  const deterministic = extractArticlesFromGmailIntel(rawEmailBody);
  console.log("[daily-market] deterministic candidate count:", deterministic.length);

  const aiAttempted = isAiConfigured();
  let candidates: ArticleCandidate[] = deterministic;
  let aiBodyError: string | null = null;
  let aiCleanError: string | null = null;

  if (aiAttempted) {
    const bodyRes = await aiReadGmailIntelAndExtractArticleBodies(rawEmailBody, candidates);
    aiBodyError = bodyRes.ok ? null : bodyRes.error ?? "ai_failed";
    candidates = bodyRes.articles;
    console.log("[daily-market] AI body extraction attempted:", true);

    const cleanRes = await aiCleanAndStructureGmailIntel(rawEmailBody, candidates);
    aiCleanError = cleanRes.ok ? null : cleanRes.error ?? "ai_failed";
    candidates = cleanRes.articles;
    console.log("[daily-market] AI cleaned candidate count:", candidates.length);
  } else {
    console.log("[daily-market] AI body extraction attempted:", false);
  }

  // Enrichment
  const rejectedReasons = new Map<string, number>();
  const counters = { rejectedNonArticle: 0, rejectedAsset: 0, resolvedOk: 0, fetchedOk: 0 };
  const enriched = await Promise.all(candidates.slice(0, 50).map((c) => enrichOne(c, rejectedReasons, counters)));

  // Stats by contentQuality
  const cqCounts = {
    full_text: enriched.filter((a) => a.contentQuality === "full_text").length,
    ai_extracted_gmail_body: enriched.filter((a) => a.contentQuality === "ai_extracted_gmail_body").length,
    partial_gmail_context: enriched.filter((a) => a.contentQuality === "partial_gmail_context").length,
    rss_snippet: enriched.filter((a) => a.contentQuality === "rss_snippet").length,
    title_only: enriched.filter((a) => a.contentQuality === "title_only").length,
  };

  // Curation (AI later; deterministic fallback for now)
  const curationRes = await aiCurateSourcesForSwiftReport(enriched);
  const curated: CuratedArticle[] = curationRes.articles;
  const keepCount = curated.filter((a) => a.keep).length;
  const rejectCount = curated.length - keepCount;
  const aiCurationError = curationRes.ok ? null : curationRes.error ?? "ai_failed";

  const topRejectedReasons = [...rejectedReasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  const bySection: Record<DailyMarketIntelSection, CuratedArticle[]> = {
    ai_market: [],
    web3_market: [],
    hrbp_leadership: [],
    employment_law: [],
    expansion_downsizing: [],
  };
  for (const a of curated) {
    bySection[a.sectionKey].push(a);
  }

  const aiSuccess = candidates.filter((c) => c.aiBodyExtractionStatus === "extracted_from_gmail").length;
  const aiPartial = candidates.filter((c) => c.aiBodyExtractionStatus === "partial_from_gmail").length;
  const aiNotFound = candidates.filter((c) => c.aiBodyExtractionStatus === "not_found").length;
  const aiFailed = candidates.filter((c) => c.aiBodyExtractionStatus === "ai_failed").length;

  console.log("[daily-market] resolved URL count:", counters.resolvedOk);
  console.log("[daily-market] full text fetched count:", cqCounts.full_text);
  console.log("[daily-market] AI Gmail body fallback count:", cqCounts.ai_extracted_gmail_body);
  console.log("[daily-market] partial Gmail context fallback count:", cqCounts.partial_gmail_context);
  console.log("[daily-market] RSS snippet fallback count:", cqCounts.rss_snippet);
  console.log("[daily-market] title-only fallback count:", cqCounts.title_only);
  console.log("[daily-market] curated keep count:", keepCount);

  return {
    generatedAt,
    sourceEmailSubject: recent[0]?.subject,
    sourceEmailDate: recent[0]?.date,
    rawEmailBodyLength: rawEmailBody.length,
    deterministicCandidateCount: deterministic.length,
    aiConfigured: aiAttempted,
    stats: {
      totalSelected: curated.length,
      fullTextCount: cqCounts.full_text,
      aiExtractedGmailBodyCount: cqCounts.ai_extracted_gmail_body,
      partialGmailContextCount: cqCounts.partial_gmail_context,
      rssSnippetCount: cqCounts.rss_snippet,
      titleOnlyCount: cqCounts.title_only,
      resolvedOkCount: counters.resolvedOk,
      fetchedOkCount: counters.fetchedOk,
      aiBodyExtractionAttempted: aiAttempted,
      aiBodyExtractionSuccessCount: aiSuccess,
      aiBodyExtractionPartialCount: aiPartial,
      aiBodyExtractionNotFoundCount: aiNotFound,
      aiBodyExtractionFailedCount: aiFailed,
      aiCleanedCount: aiAttempted ? candidates.length : 0,
      aiCuratedKeepCount: keepCount,
      aiCuratedRejectedCount: rejectCount,
      rejectedNonArticleCount: counters.rejectedNonArticle,
      rejectedAssetCount: counters.rejectedAsset,
      topRejectedReasons,
    },
    articlesBySection: bySection,
    errors: {
      aiBodyExtraction: aiBodyError,
      aiCleanup: aiCleanError,
      aiCuration: aiCurationError,
    },
  };
}

