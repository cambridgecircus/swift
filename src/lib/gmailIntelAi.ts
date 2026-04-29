import type { ArticleCandidate } from "@/lib/swiftArticleTypes";
import { extractFirstBalancedJsonObject, invokeAiJsonStrict, isAiConfigured, stripMarkdownFences } from "@/lib/aiProvider";

type AiArticlesEnvelope = {
  articles: Array<Partial<ArticleCandidate>>;
};

function safeParseArticlesJson(raw: string): AiArticlesEnvelope | null {
  const unfenced = stripMarkdownFences(raw);
  const direct = (() => {
    try {
      return JSON.parse(unfenced) as AiArticlesEnvelope;
    } catch {
      return null;
    }
  })();
  if (direct) return direct;
  const slice = extractFirstBalancedJsonObject(unfenced);
  if (!slice) return null;
  try {
    return JSON.parse(slice) as AiArticlesEnvelope;
  } catch {
    return null;
  }
}

function clamp(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function preserveUrlExact(original: string, proposed?: unknown): string {
  const p = typeof proposed === "string" ? proposed : "";
  return p.trim() === original.trim() ? original : original;
}

export async function aiReadGmailIntelAndExtractArticleBodies(
  rawEmailBody: string,
  candidates: ArticleCandidate[],
): Promise<{ ok: boolean; articles: ArticleCandidate[]; error?: string }> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      articles: candidates.map((c) => ({
        ...c,
        aiBodyExtractionStatus: "not_attempted",
        aiBodyExtractionConfidence: 0,
      })),
      error: "AI not configured",
    };
  }

  const system = `You are improving ingestion quality, not writing the final report.
You MUST NOT browse the internet. You MUST NOT invent facts. You MUST NOT invent URLs.
You will receive (1) the raw Gmail Intel email body and (2) a list of article candidates.
For each candidate, find and extract any actual excerpt/paragraph/context present in the Gmail email.
Return ONE JSON object only with shape: { "articles": [ ... ] }.
Hard rules:
- Preserve URLs exactly as provided in candidates (do not change).
- If no excerpt/body is present, set aiBodyExtractionStatus="not_found" and confidence 0-20.
- If some context but not enough, use "partial_from_gmail" with 20-60.
- If a meaningful excerpt/body is present, use "extracted_from_gmail" with 60-95.
- aiExtractedArticleBody and aiArticleSummary must be grounded in the Gmail email only.`;

  const user = JSON.stringify(
    {
      rawEmailBodyPreview: clamp(rawEmailBody, 12000),
      candidates: candidates.map((c) => ({
        sectionKey: c.sectionKey,
        rawSection: c.rawSection,
        title: c.title,
        url: c.url,
        source: c.source,
        publishedAt: c.publishedAt,
        rssSnippet: c.rssSnippet,
        query: c.query,
        surroundingText: c.surroundingText,
      })),
    },
    null,
    2,
  );

  try {
    const raw = await invokeAiJsonStrict({ system, user, temperature: 0, maxTokens: 1800 });
    const parsed = safeParseArticlesJson(raw);
    if (!parsed?.articles || !Array.isArray(parsed.articles)) throw new Error("AI JSON missing articles[]");

    const byUrl = new Map<string, Partial<ArticleCandidate>>();
    for (const a of parsed.articles) {
      const u = typeof a.url === "string" ? a.url : "";
      if (u) byUrl.set(u.trim(), a);
    }

    const out: ArticleCandidate[] = candidates.map((c): ArticleCandidate => {
      const patch = byUrl.get(c.url.trim());
      if (!patch) {
        return { ...c, aiBodyExtractionStatus: "not_found", aiBodyExtractionConfidence: 0 };
      }
      const status = patch.aiBodyExtractionStatus;
      const okStatus: ArticleCandidate["aiBodyExtractionStatus"] =
        status === "extracted_from_gmail" || status === "partial_from_gmail" || status === "not_found"
          ? status
          : "not_found";
      const conf = typeof patch.aiBodyExtractionConfidence === "number" ? patch.aiBodyExtractionConfidence : 0;
      return {
        ...c,
        // preserve URLs exactly
        url: preserveUrlExact(c.url, patch.url),
        aiExtractedArticleBody: typeof patch.aiExtractedArticleBody === "string" ? patch.aiExtractedArticleBody : "",
        aiArticleSummary: typeof patch.aiArticleSummary === "string" ? patch.aiArticleSummary : "",
        aiBodyExtractionStatus: okStatus,
        aiBodyExtractionConfidence: Math.max(0, Math.min(100, Math.floor(conf))),
      };
    });

    return { ok: true, articles: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ai_failed";
    return {
      ok: false,
      articles: candidates.map((c) => ({
        ...c,
        aiBodyExtractionStatus: "ai_failed",
        aiBodyExtractionConfidence: 0,
      })),
      error: msg,
    };
  }
}

export async function aiCleanAndStructureGmailIntel(
  rawEmailBody: string,
  candidates: ArticleCandidate[],
): Promise<{ ok: boolean; articles: ArticleCandidate[]; error?: string }> {
  if (!isAiConfigured()) return { ok: false, articles: candidates, error: "AI not configured" };

  const system = `You are cleaning and structuring Gmail Intel extraction, not writing the final report.
You MUST NOT browse the internet. You MUST NOT invent facts. You MUST NOT invent URLs.
Return ONE JSON object only: { "articles": [ ... ] }.
Rules:
- Preserve each URL exactly as provided (no modifications).
- You may clean titles, infer source, adjust sectionKey only if strongly supported by the email content.
- Remove obvious non-articles and duplicates.
- Preserve any existing aiExtractedArticleBody/aiArticleSummary/status/confidence fields without changing their meaning.`;

  const user = JSON.stringify(
    {
      rawEmailBodyPreview: clamp(rawEmailBody, 12000),
      candidates,
    },
    null,
    2,
  );

  try {
    const raw = await invokeAiJsonStrict({ system, user, temperature: 0, maxTokens: 1800 });
    const parsed = safeParseArticlesJson(raw);
    if (!parsed?.articles || !Array.isArray(parsed.articles)) throw new Error("AI JSON missing articles[]");

    const out: ArticleCandidate[] = [];
    const seen = new Set<string>();
    for (const a of parsed.articles) {
      const url = typeof a.url === "string" ? a.url.trim() : "";
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      const orig = candidates.find((c) => c.url.trim() === url) ?? candidates[0];
      out.push({
        sectionKey: (a.sectionKey as ArticleCandidate["sectionKey"]) ?? orig.sectionKey,
        rawSection: typeof a.rawSection === "string" ? a.rawSection : orig?.rawSection,
        title: typeof a.title === "string" && a.title.trim() ? a.title.trim() : orig?.title ?? url,
        url: preserveUrlExact(url, url),
        source: typeof a.source === "string" ? a.source : orig?.source,
        publishedAt: typeof a.publishedAt === "string" ? a.publishedAt : orig?.publishedAt,
        rssSnippet: typeof a.rssSnippet === "string" ? a.rssSnippet : orig?.rssSnippet,
        query: typeof a.query === "string" ? a.query : orig?.query,
        surroundingText: typeof a.surroundingText === "string" ? a.surroundingText : orig?.surroundingText,
        aiExtractedArticleBody: typeof a.aiExtractedArticleBody === "string" ? a.aiExtractedArticleBody : orig?.aiExtractedArticleBody,
        aiArticleSummary: typeof a.aiArticleSummary === "string" ? a.aiArticleSummary : orig?.aiArticleSummary,
        aiBodyExtractionStatus: (a.aiBodyExtractionStatus as ArticleCandidate["aiBodyExtractionStatus"]) ?? orig?.aiBodyExtractionStatus,
        aiBodyExtractionConfidence:
          typeof a.aiBodyExtractionConfidence === "number" ? a.aiBodyExtractionConfidence : orig?.aiBodyExtractionConfidence,
      });
    }

    return { ok: true, articles: out.length ? out : candidates };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ai_failed";
    return { ok: false, articles: candidates, error: msg };
  }
}

