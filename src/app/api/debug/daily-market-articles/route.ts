import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { runDailyMarketPipeline } from "@/lib/swiftDailyMarketPipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await runDailyMarketPipeline().catch((e) => {
    return {
      generatedAt: new Date().toISOString(),
      sourceEmailSubject: undefined,
      sourceEmailDate: undefined,
      rawEmailBodyLength: 0,
      deterministicCandidateCount: 0,
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
      articlesBySection: {
        ai_market: [],
        web3_market: [],
        hrbp_leadership: [],
        employment_law: [],
        expansion_downsizing: [],
      },
      errors: {
        aiBodyExtraction: null,
        aiCleanup: null,
        aiCuration: null,
      },
      error: e instanceof Error ? e.message : "fetch failed",
    };
  });

  return jsonResponseNoStore({
    ok: true,
    generatedAt: r.generatedAt,
    sourceEmailSubject: r.sourceEmailSubject ?? null,
    sourceEmailDate: r.sourceEmailDate ?? null,
    rawEmailBodyLength: r.rawEmailBodyLength,
    deterministicCandidateCount: r.deterministicCandidateCount,
    aiConfigured: (r as { aiConfigured?: boolean }).aiConfigured ?? false,
    sourceStats: r.stats,
    articlesBySection: r.articlesBySection,
    errors: r.errors,
    error: (r as { error?: string }).error ?? null,
  });
}

