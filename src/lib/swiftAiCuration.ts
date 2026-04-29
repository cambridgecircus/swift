import type { CuratedArticle, EnrichedArticle } from "@/lib/swiftArticleTypes";
import { extractFirstBalancedJsonObject, invokeAiJsonStrict, isAiConfigured, stripMarkdownFences } from "@/lib/aiProvider";

type Envelope = { articles: Array<Partial<CuratedArticle>> };

function safeParse(raw: string): Envelope | null {
  const unfenced = stripMarkdownFences(raw);
  try {
    return JSON.parse(unfenced) as Envelope;
  } catch {
    // fall through
  }
  const slice = extractFirstBalancedJsonObject(unfenced);
  if (!slice) return null;
  try {
    return JSON.parse(slice) as Envelope;
  } catch {
    return null;
  }
}

export async function aiCurateSourcesForSwiftReport(
  articles: EnrichedArticle[],
): Promise<{ ok: boolean; articles: CuratedArticle[]; error?: string }> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      articles: articles.map((a) => ({
        ...a,
        relevanceScore: 50,
        credibilityScore: 50,
        businessImpactScore: 50,
        keep: a.contentQuality !== "title_only",
        reason: "Deterministic fallback: AI not configured.",
      })),
      error: "AI not configured",
    };
  }

  const system = `You are SWIFT's source curation layer. You are NOT writing the final report.
You MUST NOT browse the internet. You MUST NOT invent facts or URLs.
You will receive a list of enriched articles including contentQuality and textForAI.
Score and decide keep/reject. Do not reject everything just because contentQuality is not full_text.
Return ONE JSON object only: { "articles": [ ... ] }.
Each article MUST include: url, keep (boolean), reason, relevanceScore (0-100), credibilityScore (0-100), businessImpactScore (0-100).
Use contentQuality weighting:
- full_text: highest confidence
- ai_extracted_gmail_body: medium-high
- partial_gmail_context: medium
- rss_snippet: medium-low
- title_only: low`;

  const user = JSON.stringify(
    {
      articles: articles.map((a) => ({
        sectionKey: a.sectionKey,
        title: a.title,
        source: a.source,
        url: a.url,
        resolvedUrl: a.resolvedUrl,
        contentQuality: a.contentQuality,
        textForAI: a.textForAI.slice(0, 2200),
      })),
    },
    null,
    2,
  );

  try {
    const raw = await invokeAiJsonStrict({ system, user, temperature: 0, maxTokens: 1800 });
    const parsed = safeParse(raw);
    if (!parsed?.articles || !Array.isArray(parsed.articles)) throw new Error("AI JSON missing articles[]");

    const byUrl = new Map<string, Partial<CuratedArticle>>();
    for (const a of parsed.articles) {
      const u = typeof a.url === "string" ? a.url.trim() : "";
      if (u) byUrl.set(u, a);
    }

    const out: CuratedArticle[] = articles.map((a) => {
      const patch = byUrl.get(a.url.trim());
      const rel = typeof patch?.relevanceScore === "number" ? patch.relevanceScore : 50;
      const cred = typeof patch?.credibilityScore === "number" ? patch.credibilityScore : 50;
      const imp = typeof patch?.businessImpactScore === "number" ? patch.businessImpactScore : 50;
      const keep = typeof patch?.keep === "boolean" ? patch.keep : a.contentQuality !== "title_only";
      const reason = typeof patch?.reason === "string" && patch.reason.trim() ? patch.reason.trim() : "AI curation fallback.";
      return {
        ...a,
        relevanceScore: Math.max(0, Math.min(100, Math.floor(rel))),
        credibilityScore: Math.max(0, Math.min(100, Math.floor(cred))),
        businessImpactScore: Math.max(0, Math.min(100, Math.floor(imp))),
        keep,
        reason,
      };
    });

    return { ok: true, articles: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ai_failed";
    return {
      ok: false,
      articles: articles.map((a) => ({
        ...a,
        relevanceScore: 55,
        credibilityScore: 50,
        businessImpactScore: 55,
        keep: a.contentQuality !== "title_only",
        reason: "Deterministic fallback: AI curation failed.",
      })),
      error: msg,
    };
  }
}

