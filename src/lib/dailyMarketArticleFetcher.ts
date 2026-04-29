import type { DailyMarketIntelEmail, DailyMarketIntelItem, DailyMarketIntelSection } from "@/lib/gmailDailyMarketIntel";
import { fetchDailyMarketIntelEmails } from "@/lib/gmailDailyMarketIntel";

export type DailyMarketFetchedArticle = {
  sectionKey: DailyMarketIntelSection;
  rawSection?: string;
  title: string;
  /** Original URL from Gmail Daily Market Intel. */
  url: string;
  source: string;
  query?: string;
  publishedAt?: string;
  rssSnippet?: string;
  /** Resolved publisher URL when applicable (e.g. Google News RSS articles). */
  resolvedUrl: string;
  /** Source host derived from resolvedUrl when resolution succeeds. */
  resolvedSource: string;
  contentQuality: "full_text" | "rss_snippet" | "title_only";
  /** True when resolvedUrl passes strict article-url validation. */
  resolvedOk: boolean;
  fetchedOk: boolean;
  contentPreview: string;
  contentLength: number;
  /** Always safe to pass downstream even when fetch fails. */
  textForAI: string;
  error?: string;
};

export type DailyMarketArticlesResult = {
  generatedAt: string;
  sourceEmailSubject?: string;
  sourceEmailDate?: string;
  sectionCounts: Record<DailyMarketIntelSection, number>;
  fetchedCounts: Record<DailyMarketIntelSection, number>;
  sourceStats: {
    totalSelected: number;
    fullTextCount: number;
    rssSnippetCount: number;
    titleOnlyCount: number;
    resolvedOkCount: number;
    fetchedOkCount: number;
    fallbackCount: number;
    rejectedNonArticleCount: number;
    rejectedAssetCount: number;
    topRejectedReasons: Array<{ reason: string; count: number }>;
  };
  totalSelected: number;
  totalFetchedOk: number;
  totalResolvedOk: number;
  totalFallbackOnly: number;
  rejectedAssetCount: number;
  rejectedNonArticleCount: number;
  articlesBySection: Record<DailyMarketIntelSection, DailyMarketFetchedArticle[]>;
};

const SECTION_LIMITS: Record<DailyMarketIntelSection, number> = {
  ai_market: 8,
  web3_market: 8,
  hrbp_leadership: 8,
  employment_law: 6,
  expansion_downsizing: 10,
};

function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function isLikelyDuplicateTitle(a: string, b: string): boolean {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // lightweight: one contains the other and both are reasonably long
  if (na.length >= 40 && nb.length >= 40 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function dedupeItems(items: DailyMarketIntelItem[]): DailyMarketIntelItem[] {
  const out: DailyMarketIntelItem[] = [];
  const seenUrl = new Set<string>();
  const seenTitles: string[] = [];
  for (const it of items) {
    const urlKey = it.url.trim().toLowerCase();
    if (!urlKey) continue;
    if (seenUrl.has(urlKey)) continue;
    if (seenTitles.some((t) => isLikelyDuplicateTitle(t, it.title))) continue;
    seenUrl.add(urlKey);
    seenTitles.push(it.title);
    out.push(it);
  }
  return out;
}

function pickNewestEmail(emails: DailyMarketIntelEmail[]): DailyMarketIntelEmail | null {
  if (!emails.length) return null;
  // Defensive: re-sort by date descending here too.
  const sorted = [...emails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sorted[0] ?? null;
}

function stripHtmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, " ");
  s = s.replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function stripHtmlTagsOnly(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isMeaningfulSnippet(title: string, snippet?: string): boolean {
  const s = (snippet ?? "").replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (s.length < 60) return true; // allow short snippets; they can still be useful (we'll mark via contentQuality)
  const nt = normTitle(title);
  const ns = normTitle(s);
  if (!ns) return false;
  if (ns === nt) return false;
  if (nt.length >= 20 && ns.includes(nt)) return false;
  return true;
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
    const t = stripHtmlToText(m[1]);
    return t || null;
  };

  const fromArticle = pick(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (fromArticle) return fromArticle;
  const fromMain = pick(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (fromMain) return fromMain;
  const fromBody = pick(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (fromBody) return fromBody;
  return stripHtmlToText(cleaned);
}

function looksLikeBoilerplate(text: string): boolean {
  const t = text.toLowerCase();
  const hits = [
    "cookie",
    "cookies",
    "privacy",
    "terms",
    "subscribe",
    "sign in",
    "sign-in",
    "log in",
    "login",
    "accept all",
    "manage preferences",
    "consent",
    "javascript is required",
    "enable javascript",
    "use of this site",
    "all rights reserved",
    "newsletter",
  ].filter((k) => t.includes(k)).length;
  return hits >= 4;
}

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") || "source";
  } catch {
    return "source";
  }
}

export function isLikelyArticleUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (
    host.includes("googleusercontent.com") ||
    host.endsWith("gstatic.com") ||
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host.endsWith("news.google.com") ||
    host.includes("google-analytics.com") ||
    host.includes("googletagmanager.com") ||
    host.includes("fonts.googleapis.com") ||
    host.includes("fonts.gstatic.com") ||
    host.endsWith("googleapis.com") ||
    host === "angular.dev" ||
    host.endsWith(".angular.dev") ||
    host.endsWith("doubleclick.net") ||
    host.includes("googlesyndication.com") ||
    host.includes("googleadservices.com") ||
    host.endsWith("facebook.net") ||
    host.endsWith("facebook.com") ||
    host.endsWith("twitter.com") ||
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host.endsWith("linkedin.com") ||
    host.endsWith("schema.org") ||
    host.endsWith("w3.org")
  ) {
    return false;
  }
  const full = url.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (
    path.includes("/license") ||
    full.includes("license") ||
    full.includes("terms") ||
    full.includes("privacy") ||
    full.includes("cookies") ||
    full.includes("accessibility") ||
    full.includes("analytics.js") ||
    full.includes("gtag/js") ||
    full.includes("collect?") ||
    full.includes("css?family") ||
    path === "/css" ||
    path.startsWith("/css/") ||
    path.includes("/ads/") ||
    path.includes("/tag/") ||
    full.includes("tracking") ||
    full.includes("pixel") ||
    full.includes("beacon") ||
    /\.(js|css)(\?|#|$)/i.test(full) ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico)(\?|#|$)/i.test(full) ||
    full.includes("favicon") ||
    full.includes("logo") ||
    full.includes("sprite") ||
    path.includes("/images/") ||
    path.includes("/img/") ||
    path.includes("/static/") ||
    path.includes("/assets/")
  ) {
    return false;
  }
  return true;
}

function sourceNameFromTitle(title: string): string | null {
  const t = title.trim();
  const idx = t.lastIndexOf(" - ");
  if (idx === -1) return null;
  const out = t.slice(idx + 3).trim();
  return out.length >= 2 ? out : null;
}

function normalisePublisherName(input: string): string {
  const x = input
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/(\.com|\.co\.uk|\.org|\.net)$/g, "")
    .replace(/[.\s-]+/g, "");
  // Keep this conservative: only remove very common suffixes.
  return x
    .replace(/global$/g, "")
    .replace(/singapore$/g, "")
    .replace(/uk$/g, "");
}

function hostnameCore(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return parts[0] ?? h;
  // basic eTLD-ish: keep last 2 labels unless last is 2-char ccTLD with a second-level like co.uk
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  const thirdLast = parts[parts.length - 3];
  if (last.length === 2 && secondLast === "uk" && thirdLast === "co") return parts[parts.length - 4] ?? parts[0];
  if (last.length === 2 && secondLast === "co") return parts[parts.length - 3] ?? parts[0];
  return thirdLast ?? parts[0];
}

function candidateMatchesPublisher(candidateUrl: string, title: string): boolean {
  const publisher = sourceNameFromTitle(title);
  if (!publisher) return false;
  let host = "";
  try {
    host = new URL(candidateUrl).hostname;
  } catch {
    return false;
  }
  const pubNorm = normalisePublisherName(publisher);
  const hostNorm = normalisePublisherName(hostnameCore(host));
  if (!pubNorm || !hostNorm) return false;
  return pubNorm.includes(hostNorm) || hostNorm.includes(pubNorm);
}

function extractGoogleNewsResolverCandidates(html: string): string[] {
  const out: string[] = [];
  const canonicalRe = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi;
  const ogRe = /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/gi;
  const refreshRe = /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)[^"']*["']/gi;
  let m: RegExpExecArray | null;
  while ((m = canonicalRe.exec(html))) out.push(m[1]);
  while ((m = ogRe.exec(html))) out.push(m[1]);
  while ((m = refreshRe.exec(html))) out.push(m[1]);
  return out;
}

function extractAttr(html: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}="([^"]+)"`, "i");
  const m = html.match(re);
  return m?.[1] ? m[1] : null;
}

function googleNewsArticleIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/rss\/articles\/([^/?]+)/i) ?? u.pathname.match(/\/articles\/([^/?]+)/i);
    return m?.[1] ? m[1] : null;
  } catch {
    return null;
  }
}

function buildBatchexecutePayload(articleId: string, signature: string, timestamp: string): string {
  const ts = Number.parseInt(timestamp, 10);
  const inner = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    ts,
    signature,
  ]);
  const payload = JSON.stringify([[["Fbv4je", inner]]]);
  return `f.req=${encodeURIComponent(payload)}`;
}

function safeHeadersForGoogleNews(kind: "page" | "xhr"): HeadersInit {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const base: Record<string, string> = {
    "User-Agent": ua,
    "Accept-Language": "en-US,en;q=0.9",
    // Pre-seed consent gate cookie to reduce splash pages. (Harmless if ignored.)
    Cookie: "CONSENT=PENDING+987",
  };
  if (kind === "page") {
    return {
      ...base,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Upgrade-Insecure-Requests": "1",
    };
  }
  return {
    ...base,
    Accept: "*/*",
    Origin: "https://news.google.com",
    Referer: "https://news.google.com/",
    "X-Same-Domain": "1",
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  };
}

function decodeCommonEncodings(u: string): string {
  const s = u
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u002f/g, "/");
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalizeCandidateUrl(u: string): string | null {
  const trimmed = decodeCommonEncodings(u).trim().replace(/[)\]>"'<.,;:!?]+$/g, "");
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    // Some candidates are nested inside Google redirect URLs; try to pull ?url= / ?q=.
    const parsed = new URL(trimmed);
    const inner = parsed.searchParams.get("url") ?? parsed.searchParams.get("q");
    if (inner && /^https?:\/\//i.test(inner)) return inner;
  } catch {
    // ignore
  }
  return trimmed;
}

export async function resolveGoogleNewsUrl(url: string, title: string): Promise<{
  resolvedUrl: string;
  resolvedOk: boolean;
  resolvedSource: string;
  rejectedAssetCount: number;
  rejectedNonArticleCount: number;
  rejectedPublisherMismatchCount: number;
}> {
  const fallback = () => ({
    resolvedUrl: url,
    resolvedOk: false,
    resolvedSource: "news.google.com",
    rejectedAssetCount: 0,
    rejectedNonArticleCount: 0,
    rejectedPublisherMismatchCount: 0,
  });

  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith("news.google.com")) {
      return {
        resolvedUrl: url,
        resolvedOk: isLikelyArticleUrl(url) && candidateMatchesPublisher(url, title),
        resolvedSource: hostOf(url),
        rejectedAssetCount: 0,
        rejectedNonArticleCount: 0,
        rejectedPublisherMismatchCount: 0,
      };
    }
    if (!u.pathname.includes("/rss/articles/")) {
      return fallback();
    }
  } catch {
    return fallback();
  }

  try {
    const res = await fetchWithTimeout(url, 6500);
    const rejectedAssetCount = 0;
    let rejectedNonArticleCount = 0;
    let rejectedPublisherMismatchCount = 0;

    // If redirects land directly on publisher, take it (only if likely article).
    if (res.url && isLikelyArticleUrl(res.url)) {
      try {
        const final = new URL(res.url);
        const resolvedUrl = res.url;
        const resolvedOk = isLikelyArticleUrl(resolvedUrl) && candidateMatchesPublisher(resolvedUrl, title);
        if (resolvedOk) {
          return {
            resolvedUrl,
            resolvedOk: true,
            resolvedSource: final.hostname.replace(/^www\./, ""),
            rejectedAssetCount,
            rejectedNonArticleCount,
            rejectedPublisherMismatchCount,
          };
        }
      } catch {
        // ignore
      }
    }
    const html = await res.text();
    const candidates = extractGoogleNewsResolverCandidates(html)
      .map((c) => normalizeCandidateUrl(c))
      .filter((c): c is string => typeof c === "string" && /^https?:\/\//i.test(c));

    // Start false; only set true when we find a validated article URL.
    for (const c of candidates) {
      if (!isLikelyArticleUrl(c)) {
        // Count "non-article" rejects separately; keep asset counter for binary/static.
        rejectedNonArticleCount += 1;
        continue;
      }
      if (!candidateMatchesPublisher(c, title)) {
        rejectedPublisherMismatchCount += 1;
        continue;
      }
      try {
        const cu = new URL(c);
        const resolvedUrl = c;
        const resolvedOk = isLikelyArticleUrl(resolvedUrl);
        if (!resolvedOk) {
          rejectedNonArticleCount += 1;
          continue;
        }
        const out = {
          resolvedUrl,
          resolvedOk: true,
          resolvedSource: cu.hostname.replace(/^www\./, ""),
          rejectedAssetCount,
          rejectedNonArticleCount,
          rejectedPublisherMismatchCount,
        };
        // Defensive final check: never allow resolvedOk true if validator rejects.
        if (!isLikelyArticleUrl(out.resolvedUrl) || !candidateMatchesPublisher(out.resolvedUrl, title)) return fallback();
        return out;
      } catch {
        // ignore
      }
    }

    // If canonical/og/refresh did not work, try Google News' internal decode flow:
    // - fetch https://news.google.com/articles/<id> to extract data-n-a-sg + data-n-a-ts
    // - POST to batchexecute to get the original publisher URL
    // This does NOT scan arbitrary body links; it relies on structured attributes and a known endpoint.
    const articleId = googleNewsArticleIdFromUrl(url);
    if (articleId) {
      try {
        const pageRes = await fetchWithTimeout(`https://news.google.com/articles/${articleId}`, 6500, {
          headers: safeHeadersForGoogleNews("page"),
        });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          const signature = extractAttr(pageHtml, "data-n-a-sg");
          const timestamp = extractAttr(pageHtml, "data-n-a-ts");
          if (signature && timestamp) {
            const body = buildBatchexecutePayload(articleId, signature, timestamp);
            const beRes = await fetchWithTimeout("https://news.google.com/_/DotsSplashUi/data/batchexecute", 6500, {
              method: "POST",
              headers: safeHeadersForGoogleNews("xhr"),
              body,
            });
            if (beRes.ok) {
              const txt = await beRes.text();
              const jsonPart = (txt.split("\n\n")[1] ?? "").trim();
              if (jsonPart) {
                const parsed = JSON.parse(jsonPart) as unknown[];
                const innerJson = (parsed?.[0] as unknown[] | undefined)?.[2];
                if (typeof innerJson === "string") {
                  const inner = JSON.parse(innerJson) as unknown[];
                  const decoded = typeof inner?.[1] === "string" ? String(inner[1]) : "";
                  const candidate = decoded ? normalizeCandidateUrl(decoded) : null;
                  if (candidate && isLikelyArticleUrl(candidate) && candidateMatchesPublisher(candidate, title)) {
                    const cu = new URL(candidate);
                    return {
                      resolvedUrl: candidate,
                      resolvedOk: true,
                      resolvedSource: cu.hostname.replace(/^www\./, ""),
                      rejectedAssetCount,
                      rejectedNonArticleCount,
                      rejectedPublisherMismatchCount,
                    };
                  }
                  if (candidate && isLikelyArticleUrl(candidate) && !candidateMatchesPublisher(candidate, title)) {
                    rejectedPublisherMismatchCount += 1;
                  } else if (candidate && !isLikelyArticleUrl(candidate)) {
                    rejectedNonArticleCount += 1;
                  }
                }
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return { ...fallback(), rejectedAssetCount, rejectedNonArticleCount, rejectedPublisherMismatchCount };
  } catch {
    return fallback();
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      ...init,
      headers: {
        // Lightweight polite defaults.
        "User-Agent": "SWIFT/1.0 (Daily Market Intel fetcher)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

function clampPreview(text: string, minChars = 3000, maxChars = 5000): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  // try not to cut mid-word
  const cut = slice.lastIndexOf(" ");
  const out = (cut > minChars ? slice.slice(0, cut) : slice).trim();
  return out;
}

function isClearlyBinaryOrAsset(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("image/")) return true;
  if (ct.startsWith("font/")) return true;
  if (ct.startsWith("video/")) return true;
  if (ct.includes("application/octet-stream")) return true;
  return false;
}

function isAllowedTextContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.includes("text/html") ||
    ct.includes("text/plain") ||
    ct.includes("application/xhtml+xml") ||
    ct.includes("application/xml") ||
    ct.includes("text/xml")
  );
}

function startsWithPngMagic(body: string): boolean {
  return body.startsWith("\u0089PNG") || body.startsWith("PNG");
}

function replacementCharRatio(text: string): number {
  if (!text) return 0;
  const n = (text.match(/\uFFFD/g) ?? []).length;
  return n / Math.max(1, text.length);
}

export async function fetchDailyMarketArticles(): Promise<DailyMarketArticlesResult> {
  const generatedAt = new Date().toISOString();
  const baseEmpty = (): DailyMarketArticlesResult => {
    const zero: Record<DailyMarketIntelSection, number> = {
      ai_market: 0,
      web3_market: 0,
      hrbp_leadership: 0,
      employment_law: 0,
      expansion_downsizing: 0,
    };
    return {
      generatedAt,
      sectionCounts: { ...zero },
      fetchedCounts: { ...zero },
      sourceStats: {
        totalSelected: 0,
        fullTextCount: 0,
        rssSnippetCount: 0,
        titleOnlyCount: 0,
        resolvedOkCount: 0,
        fetchedOkCount: 0,
        fallbackCount: 0,
        rejectedNonArticleCount: 0,
        rejectedAssetCount: 0,
        topRejectedReasons: [],
      },
      totalSelected: 0,
      totalFetchedOk: 0,
      totalResolvedOk: 0,
      totalFallbackOnly: 0,
      rejectedAssetCount: 0,
      rejectedNonArticleCount: 0,
      articlesBySection: {
        ai_market: [],
        web3_market: [],
        hrbp_leadership: [],
        employment_law: [],
        expansion_downsizing: [],
      },
    };
  };

  const intel = await fetchDailyMarketIntelEmails().catch(() => ({ generatedAt, emails: [] as DailyMarketIntelEmail[] }));
  const newest = pickNewestEmail(intel.emails ?? []);
  if (!newest) return baseEmpty();

  const sectionCounts: Record<DailyMarketIntelSection, number> = {
    ai_market: newest.sections.ai_market.length,
    web3_market: newest.sections.web3_market.length,
    hrbp_leadership: newest.sections.hrbp_leadership.length,
    employment_law: newest.sections.employment_law.length,
    expansion_downsizing: newest.sections.expansion_downsizing.length,
  };

  const selectedBySection: Record<DailyMarketIntelSection, DailyMarketIntelItem[]> = {
    ai_market: [],
    web3_market: [],
    hrbp_leadership: [],
    employment_law: [],
    expansion_downsizing: [],
  };

  for (const key of Object.keys(SECTION_LIMITS) as DailyMarketIntelSection[]) {
    const items = dedupeItems(newest.sections[key] ?? []);
    selectedBySection[key] = items.slice(0, SECTION_LIMITS[key]);
  }

  // Cross-section dedupe by URL (keep first occurrence).
  const globalSeen = new Set<string>();
  for (const key of Object.keys(selectedBySection) as DailyMarketIntelSection[]) {
    selectedBySection[key] = selectedBySection[key].filter((it) => {
      const k = it.url.trim().toLowerCase();
      if (!k) return false;
      if (globalSeen.has(k)) return false;
      globalSeen.add(k);
      return true;
    });
  }

  const fetchedCounts: Record<DailyMarketIntelSection, number> = {
    ai_market: 0,
    web3_market: 0,
    hrbp_leadership: 0,
    employment_law: 0,
    expansion_downsizing: 0,
  };

  const articlesBySection: Record<DailyMarketIntelSection, DailyMarketFetchedArticle[]> = {
    ai_market: [],
    web3_market: [],
    hrbp_leadership: [],
    employment_law: [],
    expansion_downsizing: [],
  };

  const tasks: Array<Promise<void>> = [];
  let totalSelected = 0;
  let totalResolvedOk = 0;
  let totalFallbackOnly = 0;
  let rejectedAssetCount = 0;
  let rejectedNonArticleCount = 0;
  let fullTextCount = 0;
  let rssSnippetCount = 0;
  let titleOnlyCount = 0;
  let resolvedOkCount = 0;
  let fetchedOkCount = 0;
  const rejectedReasons = new Map<string, number>();
  const bumpReason = (reason: string) => rejectedReasons.set(reason, (rejectedReasons.get(reason) ?? 0) + 1);

  for (const sectionKey of Object.keys(selectedBySection) as DailyMarketIntelSection[]) {
    for (const item of selectedBySection[sectionKey]) {
      totalSelected++;
      tasks.push(
        (async () => {
          const originalUrl = item.url;
          const resolved = await resolveGoogleNewsUrl(originalUrl, item.title);
          const resolvedUrl = resolved.resolvedUrl;
          const resolvedSource = resolved.resolvedSource;
          const resolvedOk = resolved.resolvedOk && isLikelyArticleUrl(resolvedUrl);
          rejectedAssetCount += resolved.rejectedAssetCount;
          rejectedNonArticleCount += resolved.rejectedNonArticleCount;
          if (resolvedOk) {
            totalResolvedOk += 1;
            resolvedOkCount += 1;
          }

          const recordBase: Omit<
            DailyMarketFetchedArticle,
            "fetchedOk" | "contentPreview" | "contentLength" | "textForAI" | "error"
          > = {
            sectionKey,
            rawSection: item.rawSection,
            title: item.title,
            url: originalUrl,
            source: item.source,
            query: (item as DailyMarketIntelItem).query,
            publishedAt: item.publishedAt ?? newest.date,
            rssSnippet: item.rssSnippet,
            resolvedUrl,
            resolvedSource,
            contentQuality: "title_only",
            resolvedOk,
          };

          try {
            // Tier 1: full-text fetch only when we have a real publisher URL.
            if (resolvedOk) {
              const res = await fetchWithTimeout(resolvedUrl, 9000);
              const contentType = res.headers.get("content-type") ?? "";

              if (isClearlyBinaryOrAsset(contentType) || !isAllowedTextContentType(contentType)) {
                rejectedAssetCount += 1;
                bumpReason("content_type_not_text");
              } else if (!res.ok) {
                bumpReason(`HTTP ${res.status}`);
              } else {
                const body = await res.text();
                if (startsWithPngMagic(body)) {
                  rejectedAssetCount += 1;
                  bumpReason("binary_or_image_response");
                } else {
                  const text =
                    contentType.toLowerCase().includes("text/html") || body.includes("<html")
                      ? extractReadableFromHtml(body)
                      : body.replace(/\s+/g, " ").trim();

                  if (replacementCharRatio(text) > 0.03) {
                    bumpReason("binary_or_corrupt_text");
                  } else if (text.length < 800) {
                    bumpReason("content_too_short_or_google_intermediate");
                  } else if (looksLikeBoilerplate(text)) {
                    bumpReason("boilerplate_only");
                  } else {
                    const contentPreview = clampPreview(text, 3500, 8000);
                    const publishedAt = recordBase.publishedAt ? `\nPublishedAt: ${recordBase.publishedAt}` : "";
                    const textForAI = `${item.title}\nSource: ${item.source}${publishedAt}\nURL: ${resolvedUrl}\nContent quality: full_text\n\n${contentPreview}`;
                    articlesBySection[sectionKey].push({
                      ...recordBase,
                      contentQuality: "full_text",
                      fetchedOk: true,
                      contentPreview,
                      contentLength: text.length,
                      textForAI,
                    });
                    fetchedCounts[sectionKey] += 1;
                    fullTextCount += 1;
                    fetchedOkCount += 1;
                    return;
                  }
                }
              }
            }

            // Tier 2: RSS snippet fallback (best-effort from email).
            const snippet = item.rssSnippet ? stripHtmlTagsOnly(item.rssSnippet).trim() : "";
            if (snippet) {
              const publishedAt = recordBase.publishedAt ? `\nPublishedAt: ${recordBase.publishedAt}` : "";
              const urlLine = resolvedOk ? `\nResolved URL: ${resolvedUrl}` : `\nOriginal URL: ${originalUrl}`;
              const note = isMeaningfulSnippet(item.title, snippet)
                ? "Note: Full article content could not be fetched; analyse from RSS snippet and title only."
                : "Note: RSS snippet is limited/duplicative; treat as medium-confidence context only.";
              const textForAI = `${item.title}\nSource: ${item.source}${publishedAt}${urlLine}\nContent quality: rss_snippet\nRSS snippet: ${snippet}\n${note}`;
              articlesBySection[sectionKey].push({
                ...recordBase,
                contentQuality: "rss_snippet",
                fetchedOk: false,
                contentPreview: "",
                contentLength: 0,
                textForAI,
                error: "rss_snippet_fallback",
              });
              rssSnippetCount += 1;
              totalFallbackOnly += 1;
              return;
            }

            // Tier 3: title-only fallback.
            const publishedAt = recordBase.publishedAt ? `\nPublishedAt: ${recordBase.publishedAt}` : "";
            const urlLine = resolvedOk ? `\nResolved URL: ${resolvedUrl}` : `\nOriginal URL: ${originalUrl}`;
            const textForAI = `${item.title}\nSource: ${item.source}${publishedAt}${urlLine}\nContent quality: title_only\nNote: Full article content could not be fetched; analyse from title/source only.`;
            articlesBySection[sectionKey].push({
              ...recordBase,
              contentQuality: "title_only",
              fetchedOk: false,
              contentPreview: "",
              contentLength: 0,
              textForAI,
              error: "content_too_short_or_google_intermediate",
            });
            titleOnlyCount += 1;
            bumpReason("content_too_short_or_google_intermediate");
            totalFallbackOnly += 1;
            return;
          } catch (e) {
            const msg =
              e instanceof Error
                ? e.name === "AbortError"
                  ? "Timeout"
                  : e.message
                : "Fetch failed";
            bumpReason(msg);

            const snippet = item.rssSnippet ? stripHtmlTagsOnly(item.rssSnippet).trim() : "";
            const publishedAt = recordBase.publishedAt ? `\nPublishedAt: ${recordBase.publishedAt}` : "";
            const hasSnippet = Boolean(snippet);
            const urlLine = resolvedOk ? `\nResolved URL: ${resolvedUrl}` : `\nOriginal URL: ${originalUrl}`;
            const textForAI = hasSnippet
              ? `${item.title}\nSource: ${item.source}${publishedAt}${urlLine}\nContent quality: rss_snippet\nRSS snippet: ${snippet}\nNote: Full article content could not be fetched; analyse from RSS snippet and title only.`
              : `${item.title}\nSource: ${item.source}${publishedAt}${urlLine}\nContent quality: title_only\nNote: Full article content could not be fetched; analyse from title/source only.`;
            articlesBySection[sectionKey].push({
              ...recordBase,
              contentQuality: hasSnippet ? "rss_snippet" : "title_only",
              fetchedOk: false,
              contentPreview: "",
              contentLength: 0,
              textForAI,
              error: hasSnippet ? "rss_snippet_fallback" : msg,
            });
            totalFallbackOnly += 1;
            if (hasSnippet) rssSnippetCount += 1;
            else titleOnlyCount += 1;
          }
        })(),
      );
    }
  }

  await Promise.all(tasks);

  // Sort each section so successful fetches appear first.
  for (const k of Object.keys(articlesBySection) as DailyMarketIntelSection[]) {
    articlesBySection[k].sort((a, b) => Number(b.fetchedOk) - Number(a.fetchedOk));
  }

  const totalFetchedOk = Object.values(fetchedCounts).reduce((a, b) => a + b, 0);
  const topRejectedReasons = [...rejectedReasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    generatedAt,
    sourceEmailSubject: newest.subject,
    sourceEmailDate: newest.date,
    sectionCounts,
    fetchedCounts,
    sourceStats: {
      totalSelected,
      fullTextCount,
      rssSnippetCount,
      titleOnlyCount,
      resolvedOkCount,
      fetchedOkCount,
      fallbackCount: totalFallbackOnly,
      rejectedNonArticleCount,
      rejectedAssetCount,
      topRejectedReasons,
    },
    totalSelected,
    totalFetchedOk,
    totalResolvedOk,
    totalFallbackOnly,
    rejectedAssetCount,
    rejectedNonArticleCount,
    articlesBySection,
  };
}

