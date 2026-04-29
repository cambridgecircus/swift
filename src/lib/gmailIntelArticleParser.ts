import type { ArticleCandidate } from "@/lib/swiftArticleTypes";
import type { DailyMarketIntelSection } from "@/lib/gmailDailyMarketIntel";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/[)\]>"'<.,;:!?]+$/g, "");
}

function isUselessUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return true;
  if (u.startsWith("mailto:")) return true;
  if (u.includes("unsubscribe")) return true;
  if (u.includes("email-settings") || u.includes("psettings") || u.includes("/settings")) return true;
  if (u.includes("/help") || u.includes("support")) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|#|$)/i.test(u)) return true;
  if (/\.(css|js|woff2?|ttf|eot)(\?|#|$)/i.test(u)) return true;
  if (u.includes("doubleclick.net") || u.includes("googletagmanager") || u.includes("google-analytics")) return true;
  return false;
}

function sectionFromHeadingText(text: string): DailyMarketIntelSection | null {
  const t = text.toLowerCase();
  if (t.includes("swift ai market intel") || (t.includes("ai") && t.includes("market intel"))) return "ai_market";
  if (t.includes("swift web3 market intel") || (t.includes("web3") && t.includes("market intel"))) return "web3_market";
  if (t.includes("swift hrbp") || t.includes("hr leadership") || t.includes("hrbp and hr")) return "hrbp_leadership";
  if (t.includes("employment law")) return "employment_law";
  if (t.includes("expansion downsizing") || t.includes("downsizing") || t.includes("expansion")) return "expansion_downsizing";
  return null;
}

function sourceFromTitleSuffix(title: string): string | undefined {
  const idx = title.lastIndexOf(" - ");
  if (idx === -1) return undefined;
  const tail = title.slice(idx + 3).trim();
  return tail.length >= 2 ? tail : undefined;
}

function extractPublishedAt(text: string): string | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  // Common: "2026-04-28", "Apr 28, 2026", "28 Apr 2026", ISO timestamps.
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?)\b/);
  if (iso?.[1]) return iso[1];
  const d1 = t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b/i);
  if (d1?.[0]) return d1[0];
  const d2 = t.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}\b/i);
  if (d2?.[0]) return d2[0];
  return undefined;
}

function extractQuery(text: string): string | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  const m =
    t.match(/\bquery\b\s*[:\-–]\s*([^|•\n]{3,120})/i) ??
    t.match(/\bsearch\b\s*[:\-–]\s*([^|•\n]{3,120})/i);
  return m?.[1]?.trim();
}

function dedupe(cands: ArticleCandidate[]): ArticleCandidate[] {
  const out: ArticleCandidate[] = [];
  const seenUrl = new Set<string>();
  const seenTitleSource = new Set<string>();
  for (const c of cands) {
    const urlKey = c.url.trim().toLowerCase();
    if (!urlKey || seenUrl.has(urlKey)) continue;
    const tsKey = `${c.title}`.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
    const srcKey = (c.source ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const combo = `${tsKey}||${srcKey}`;
    if (seenTitleSource.has(combo)) continue;
    seenUrl.add(urlKey);
    seenTitleSource.add(combo);
    out.push(c);
  }
  return out;
}

/**
 * Deterministic best-effort extraction of article candidates from a raw Gmail Intel body.
 * This does NOT use AI.
 */
export function extractArticlesFromGmailIntel(rawEmailBody: string): ArticleCandidate[] {
  const raw = rawEmailBody || "";
  const isHtml = /<a\b|<h1\b|<h2\b|<h3\b|<strong\b/i.test(raw);
  const html = raw;
  // Keep a normalised text copy for future heuristics/debugging.
  void (isHtml ? stripTags(raw) : raw.replace(/\s+/g, " ").trim());

  let currentSection: DailyMarketIntelSection | null = null;
  let currentRawSection: string | undefined;
  const candidates: ArticleCandidate[] = [];

  // Heading detection (HTML and text)
  const headingEvents: Array<{ idx: number; section: DailyMarketIntelSection; raw: string }> = [];
  if (isHtml) {
    const headingRe = /<(h1|h2|h3|strong)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(html))) {
      const h = stripTags(m[2] ?? "");
      const sec = h ? sectionFromHeadingText(h) : null;
      if (sec) headingEvents.push({ idx: m.index, section: sec, raw: h });
    }
  } else {
    const lines = raw.split(/\r?\n/);
    let pos = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const sec = sectionFromHeadingText(trimmed);
      if (sec) headingEvents.push({ idx: pos, section: sec, raw: trimmed });
      pos += line.length + 1;
    }
  }
  headingEvents.sort((a, b) => a.idx - b.idx);

  const sectionAt = (idx: number): { section: DailyMarketIntelSection | null; rawSection?: string } => {
    let s: { section: DailyMarketIntelSection | null; rawSection?: string } = { section: null };
    for (const e of headingEvents) {
      if (e.idx > idx) break;
      s = { section: e.section, rawSection: e.raw };
    }
    return s;
  };

  if (isHtml) {
    const anchorRe = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html))) {
      const href = normalizeUrl((m[1] ?? m[2] ?? "").trim());
      if (!href || isUselessUrl(href)) continue;
      const title = stripTags(m[3] ?? "").trim() || href;

      const ctx = sectionAt(m.index);
      currentSection = ctx.section ?? currentSection;
      currentRawSection = ctx.rawSection ?? currentRawSection;

      // Surrounding window: a little before + after anchor.
      const before = html.slice(Math.max(0, m.index - 280), m.index);
      const after = html.slice(anchorRe.lastIndex, Math.min(html.length, anchorRe.lastIndex + 520));
      const surroundingText = stripTags(`${before} ${title} ${after}`).trim().slice(0, 900);

      const publishedAt = extractPublishedAt(surroundingText);
      const query = extractQuery(surroundingText);
      const rssSnippet = (() => {
        const cleaned = stripTags(after).trim();
        return cleaned ? cleaned.slice(0, 600) : undefined;
      })();

      const source = sourceFromTitleSuffix(title);
      const sectionKey = currentSection ?? "web3_market";

      candidates.push({
        sectionKey,
        rawSection: currentRawSection,
        title,
        url: href,
        source,
        publishedAt,
        rssSnippet,
        query,
        surroundingText,
      });
    }
  } else {
    // Text mode: scan URLs; use nearby lines for context
    const lines = raw.split(/\r?\n/);
    const urlRe = /https?:\/\/[^\s\])"'<>]+/gi;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const sec = sectionFromHeadingText(line.trim());
      if (sec) {
        currentSection = sec;
        currentRawSection = line.trim();
        continue;
      }
      const urls = line.match(urlRe) ?? [];
      for (const u0 of urls) {
        const href = normalizeUrl(u0);
        if (!href || isUselessUrl(href)) continue;
        const window = [lines[i - 1] ?? "", lines[i] ?? "", lines[i + 1] ?? "", lines[i + 2] ?? ""]
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 900);
        const title = window && window.length >= 8 ? window : href;
        candidates.push({
          sectionKey: currentSection ?? "web3_market",
          rawSection: currentRawSection,
          title,
          url: href,
          source: sourceFromTitleSuffix(title),
          publishedAt: extractPublishedAt(window),
          rssSnippet: undefined,
          query: extractQuery(window),
          surroundingText: window,
        });
      }
    }
  }

  // Ensure we return something even if parsing was weak.
  const out = dedupe(candidates);
  return out.map((c) => ({
    ...c,
    source: c.source?.trim() || undefined,
    publishedAt: c.publishedAt?.trim() || undefined,
    query: c.query?.trim() || undefined,
    rssSnippet: c.rssSnippet?.trim() || undefined,
    surroundingText: c.surroundingText?.trim() || undefined,
    aiBodyExtractionStatus: "not_attempted",
    aiBodyExtractionConfidence: 0,
    aiExtractedArticleBody: "",
    aiArticleSummary: "",
  }));
}

