import type { DailyMarketIntelSection } from "@/lib/gmailDailyMarketIntel";

export type ArticleCandidate = {
  sectionKey: DailyMarketIntelSection;
  rawSection?: string;
  title: string;
  /** Original URL exactly as seen in Gmail Intel. */
  url: string;
  source?: string;
  publishedAt?: string;
  rssSnippet?: string;
  query?: string;
  surroundingText?: string;

  aiExtractedArticleBody?: string;
  aiArticleSummary?: string;
  aiBodyExtractionStatus?: "extracted_from_gmail" | "partial_from_gmail" | "not_found" | "not_attempted" | "ai_failed";
  aiBodyExtractionConfidence?: number; // 0-100
};

export type EnrichedArticle = ArticleCandidate & {
  resolvedUrl?: string;
  resolvedSource?: string;

  contentQuality:
    | "full_text"
    | "ai_extracted_gmail_body"
    | "partial_gmail_context"
    | "rss_snippet"
    | "title_only";

  resolvedOk: boolean;
  fetchedOk: boolean;
  contentPreview?: string;
  contentLength?: number;
  textForAI: string;
  error?: string | null;
};

export type CuratedArticle = EnrichedArticle & {
  relevanceScore: number;
  credibilityScore: number;
  businessImpactScore: number;
  keep: boolean;
  reason: string;
};

