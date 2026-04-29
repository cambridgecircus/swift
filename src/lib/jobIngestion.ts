import { XMLParser } from "fast-xml-parser";

import { isRealJobApplyUrl } from "@/lib/jobApplyUrl";
import type {
  CleanJobOpportunity,
  NeedsManualReviewJob,
  RawJobItem,
} from "@/lib/types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SWIFT-JobIngestion/1.0; +https://web3.career) AppleWebKit/537.36";

const FETCH_TIMEOUT_MS = 12_000;

export type LiveJobSourceHealth = {
  sourceName: string;
  status: "ok" | "failed" | "manual_review";
  itemCount: number;
  errorMessage?: string;
};

export type LiveJobIngestionResponse = {
  status: "ok";
  checkedAt: string;
  rawCount: number;
  cleanCount: number;
  opportunities: CleanJobOpportunity[];
  needsManualReview: NeedsManualReviewJob[];
  sourceHealth: LiveJobSourceHealth[];
  linkedInCache?: {
    reason: "cache_hit" | "cache_miss" | "cache_expired";
    isRefreshing: boolean;
    hasCachedValue: boolean;
    lastUpdatedAt: string | null;
    ttlMs: number;
    forceRefresh?: boolean;
  };
};

const ATS_HOST_MARKERS = [
  "lever.co",
  "greenhouse.io",
  "ashbyhq.com",
  "workable.com",
  "bamboohr.com",
  "smartrecruiters.com",
  "recruitee.com",
  "jobvite.com",
  "icims.com",
  "myworkdayjobs.com",
  "taleo.net",
  "applytojob.com",
  "rippling.com",
  "personio.com",
  "comeet.co",
];

function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Apply URL must be real (not placeholder) and on source host, known ATS, or LinkedIn job view URLs.
 */
export function isAcceptedIngestionApplyUrl(applyUrl: string, sourcePageUrl: string): boolean {
  if (!isRealJobApplyUrl(applyUrl)) return false;
  let parsedApply: URL;
  try {
    parsedApply = new URL(applyUrl);
  } catch {
    return false;
  }
  const applyHost = parsedApply.hostname.toLowerCase().replace(/^www\./, "");
  if (applyHost.includes("linkedin.com") && /\/jobs|\/comm\/jobs/i.test(parsedApply.pathname)) {
    return true;
  }
  const srcHost = hostnameOf(sourcePageUrl);
  if (!applyHost || !srcHost) return false;
  if (applyHost === srcHost || applyHost.endsWith(`.${srcHost}`) || srcHost.endsWith(`.${applyHost}`)) {
    return true;
  }
  return ATS_HOST_MARKERS.some((m) => applyHost.includes(m));
}

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseWeb3CareerSlug(slug: string): { role: string; company: string } {
  const lastHyphen = slug.lastIndexOf("-");
  if (lastHyphen <= 0) {
    return { role: titleCaseWords(slug.replace(/-/g, " ")), company: "Unknown" };
  }
  const companySlug = slug.slice(lastHyphen + 1);
  const roleSlug = slug.slice(0, lastHyphen);
  return {
    role: titleCaseWords(roleSlug.replace(/-/g, " ")),
    company: titleCaseWords(companySlug.replace(/-/g, " ")),
  };
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

const ROLE_CHECKS: ((t: string) => boolean)[] = [
  (t) => /\bhrbp\b/.test(t),
  (t) => t.includes("hr business partner"),
  (t) => t.includes("people business partner"),
  (t) => /\bpeople\s+partner\b/.test(t),
  (t) => /\bsenior\s+people\s+partner\b/.test(t),
  (t) => t.includes("people operations partner"),
  (t) => t.includes("people ops lead"),
  (t) => t.includes("head of people"),
  (t) => t.includes("head of hr"),
  (t) => /\bhr\s+lead\b/.test(t),
  (t) => /\bpeople\s+lead\b/.test(t),
  (t) => t.includes("people director"),
  (t) => t.includes("hr director"),
  (t) => t.includes("director of people"),
  (t) => /\bvp\s+people\b/.test(t) || t.includes("vp of people"),
  (t) => t.includes("chief people officer") || /\bcpo\b/.test(t),
  (t) => t.includes("head of talent"),
  (t) => t.includes("talent lead"),
  (t) => t.includes("people operations lead"),
  (t) => t.includes("hr operations lead"),
  (t) => t.includes("head of people operations"),
  (t) => t.includes("people & culture") || t.includes("people and culture"),
  (t) => t.includes("employee experience lead"),
];

const INDUSTRY_CHECK: ((t: string) => boolean)[] = [
  (t) => /\bweb3\b/.test(t),
  (t) => t.includes("crypto"),
  (t) => t.includes("blockchain"),
  (t) => t.includes("digital asset"),
  (t) => t.includes("virtual asset"),
  (t) => t.includes("fintech"),
  (t) => /\bai\b/.test(t) || t.includes("artificial intelligence") || t.includes("generative ai"),
  (t) => t.includes("defi"),
  (t) => t.includes("ethereum") || t.includes("bitcoin") || t.includes("token"),
];

const LOCATION_TERMS = [
  "uae",
  "dubai",
  "abu dhabi",
  "united arab emirates",
  "saudi",
  "saudi arabia",
  "riyadh",
  "qatar",
  "doha",
  "kuwait",
  "bahrain",
  "oman",
  "muscat",
  "gcc",
  "uk",
  "united kingdom",
  "london",
  "europe",
  "european",
  "emea",
  "remote",
  "anywhere",
  "no geographical restrictions",
  "globally",
  "hybrid",
  "portugal",
  "singapore",
  "ireland",
  "germany",
  "france",
  "netherlands",
  "canada",
];

const SENIORITY_TERMS = [
  "head",
  "director",
  "vp",
  "vice president",
  "chief",
  "senior",
  "lead",
  "principal",
];

export function matchesRoleProfile(text: string): boolean {
  const t = text.toLowerCase();
  return ROLE_CHECKS.some((fn) => fn(t));
}

export function matchesIndustryContext(text: string, implicitWeb3: boolean): boolean {
  if (implicitWeb3) return true;
  const t = text.toLowerCase();
  return INDUSTRY_CHECK.some((fn) => fn(t));
}

export function matchesLocationProfile(text: string): boolean {
  const t = text.toLowerCase();
  return LOCATION_TERMS.some((w) => t.includes(w));
}

/** Role relevance 0–35 from role title + supporting text (SWIFT People leadership profile). */
export function computeRoleRelevance35(role: string, blob: string): number {
  const t = `${role} ${blob}`.toLowerCase();
  let roleScore = 0;
  if (
    /\bhrbp\b/.test(t) ||
    t.includes("hr business partner") ||
    /\bpeople\s+partner\b/.test(t) ||
    /\bsenior\s+people\s+partner\b/.test(t) ||
    t.includes("people business partner")
  ) {
    roleScore = 32;
  } else if (
    t.includes("head of people") ||
    t.includes("head of hr") ||
    t.includes("chief people officer") ||
    /\bcpo\b/.test(t) ||
    /\bvp\s+people\b/.test(t) ||
    t.includes("vp of people")
  ) {
    roleScore = 35;
  } else if (
    t.includes("people director") ||
    t.includes("hr director") ||
    t.includes("director of people") ||
    t.includes("head of talent")
  ) {
    roleScore = 30;
  } else if (
    t.includes("people lead") ||
    t.includes("hr lead") ||
    t.includes("talent lead") ||
    t.includes("people operations lead") ||
    t.includes("people ops lead") ||
    t.includes("hr operations lead") ||
    t.includes("head of people operations") ||
    t.includes("employee experience lead") ||
    t.includes("people & culture") ||
    t.includes("people and culture")
  ) {
    roleScore = 26;
  } else if (ROLE_CHECKS.some((fn) => fn(t))) {
    roleScore = 22;
  }
  return roleScore;
}

/** Fit: role 0–35, industry 0–25, location 0–15, seniority 0–15, application quality 0–10. */
export function computeDeterministicFitScore(role: string, blob: string, applyUrl?: string): number {
  const t = `${role} ${blob}`.toLowerCase();
  const roleScore = computeRoleRelevance35(role, blob);

  let ind = 0;
  if (INDUSTRY_CHECK.some((fn) => fn(t))) ind = 25;
  let loc = 0;
  if (LOCATION_TERMS.some((w) => t.includes(w))) loc = 15;
  let sen = 0;
  if (SENIORITY_TERMS.some((w) => t.includes(w))) sen = 15;
  else if (t.includes("manager")) sen = 8;

  const app = applyUrl && isRealJobApplyUrl(applyUrl) ? 10 : 6;

  return Math.min(100, roleScore + ind + loc + sen + app);
}

function finalizeCleanOpportunity(raw: RawJobItem): CleanJobOpportunity {
  const blob = `${raw.role} ${raw.company} ${raw.location} ${raw.descriptionSnippet ?? ""} ${raw.rawText ?? ""}`;
  const fitScore = computeDeterministicFitScore(raw.role, blob, raw.applyUrl);
  return {
    id: raw.id,
    role: raw.role,
    company: raw.company,
    location: raw.location,
    source: raw.sourceName,
    sourceUrl: raw.sourceUrl,
    applyUrl: raw.applyUrl,
    dateFound: raw.dateFound,
    fitScore,
    whyThisFits: `${fitScore}/100 fit — role relevance, industry match, target geography, seniority and application link quality. Source: ${raw.sourceName}.`,
    gaps: [
      "Validate role scope and seniority against your internal leveling.",
      "Confirm compensation band and contract type before investing time.",
    ],
    recommendedAction:
      "Open the listing, verify the JD against your capability map, and decide whether to apply or route to your talent pipeline.",
    status: "live",
  };
}

async function ingestWeb3CareerPage(
  listingUrl: string,
  sourceName: string,
): Promise<{
  health: LiveJobSourceHealth;
  raw: RawJobItem[];
}> {
  try {
    const res = await fetchWithTimeout(listingUrl);
    if (!res.ok) {
      return {
        health: {
          sourceName,
          status: "failed",
          itemCount: 0,
          errorMessage: `HTTP ${res.status}`,
        },
        raw: [],
      };
    }
    const html = await res.text();
    const re = /href="(\/[a-z0-9-]+\/\d{5,})"/gi;
    const seen = new Set<string>();
    const raw: RawJobItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const path = m[1];
      if (seen.has(path)) continue;
      seen.add(path);
      if (seen.size > 40) break;
      const parts = path.split("/").filter(Boolean);
      if (parts.length < 2) continue;
      const slug = parts[0] ?? "";
      const idNum = parts[1] ?? "";
      if (!/^\d{5,}$/.test(idNum)) continue;
      const { role, company } = parseWeb3CareerSlug(slug);
      const applyUrl = `https://web3.career${path}`;
      const sourceUrl = applyUrl;
      raw.push({
        id: `web3-career-${idNum}-${hashId(listingUrl)}`,
        role,
        company,
        location: "See listing",
        sourceName,
        sourceUrl,
        applyUrl,
        dateFound: new Date().toISOString(),
        rawText: slug,
      });
    }
    return {
      health: {
        sourceName,
        status: raw.length ? "ok" : "manual_review",
        itemCount: raw.length,
        ...(raw.length ? {} : { errorMessage: "No job links parsed from listing HTML." }),
      },
      raw,
    };
  } catch (e) {
    return {
      health: {
        sourceName,
        status: "failed",
        itemCount: 0,
        errorMessage: e instanceof Error ? e.message : "fetch failed",
      },
      raw: [],
    };
  }
}

type RssItem = {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
};

async function ingestCryptocurrencyJobsRss(): Promise<{
  health: LiveJobSourceHealth;
  raw: RawJobItem[];
}> {
  const rssUrl = "https://cryptocurrencyjobs.co/index.xml";
  const sourceName = "Cryptocurrency Jobs";
  try {
    const res = await fetchWithTimeout(rssUrl);
    if (!res.ok) {
      return {
        health: {
          sourceName,
          status: "failed",
          itemCount: 0,
          errorMessage: `HTTP ${res.status}`,
        },
        raw: [],
      };
    }
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    const doc = parser.parse(xml) as {
      rss?: { channel?: { item?: RssItem | RssItem[] } };
    };
    const channel = doc.rss?.channel;
    const items = channel?.item;
    const list: RssItem[] = Array.isArray(items) ? items : items ? [items] : [];
    const raw: RawJobItem[] = [];
    for (const it of list.slice(0, 150)) {
      const title = decodeXmlText(String(it.title ?? "")).trim();
      const link = String(it.link ?? "").trim();
      const description = decodeXmlText(String(it.description ?? "")).trim();
      const pub = String(it.pubDate ?? "").trim();
      if (!title || !link.startsWith("http")) continue;
      const atIdx = title.toLowerCase().lastIndexOf(" at ");
      let role = title;
      let company = "Unknown";
      if (atIdx !== -1) {
        role = title.slice(0, atIdx).trim();
        company = title.slice(atIdx + 4).trim();
      }
      const dateFound = pub ? new Date(pub).toISOString() : new Date().toISOString();
      const locMatch = description.match(
        /(?:based in|remotely anywhere in|done remotely anywhere in|remote)[^.]+/i,
      );
      const location = locMatch ? locMatch[0].slice(0, 120) : "See listing";
      raw.push({
        id: `crypto-jobs-${hashId(link)}`,
        role,
        company,
        location,
        sourceName,
        sourceUrl: link,
        applyUrl: link,
        descriptionSnippet: description.slice(0, 280),
        dateFound,
        rawText: description,
      });
    }
    return {
      health: {
        sourceName,
        status: raw.length ? "ok" : "manual_review",
        itemCount: raw.length,
        ...(raw.length ? {} : { errorMessage: "RSS contained no items." }),
      },
      raw,
    };
  } catch (e) {
    return {
      health: {
        sourceName,
        status: "failed",
        itemCount: 0,
        errorMessage: e instanceof Error ? e.message : "fetch failed",
      },
      raw: [],
    };
  }
}

async function ingestCryptoJobsListHomepage(): Promise<{
  health: LiveJobSourceHealth;
  raw: RawJobItem[];
}> {
  const listingUrl = "https://cryptojobslist.com/";
  const sourceName = "CryptoJobsList";
  try {
    const res = await fetchWithTimeout(listingUrl);
    if (!res.ok) {
      return {
        health: { sourceName, status: "failed", itemCount: 0, errorMessage: `HTTP ${res.status}` },
        raw: [],
      };
    }
    const html = await res.text();
    const re = /href="(https:\/\/cryptojobslist\.com\/jobs\/[^"]+)"/gi;
    const seen = new Set<string>();
    const raw: RawJobItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const abs = m[1]?.trim();
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      if (seen.size > 60) break;
      let role = "See listing";
      let company = "Unknown";
      try {
        const path = new URL(abs).pathname;
        const seg = path.split("/").filter(Boolean).pop() ?? "";
        const atSplit = seg.toLowerCase().lastIndexOf("-at-");
        if (atSplit !== -1) {
          role = titleCaseWords(seg.slice(0, atSplit).replace(/-/g, " "));
          company = titleCaseWords(seg.slice(atSplit + 4).replace(/-/g, " "));
        }
      } catch {
        /* keep defaults */
      }
      raw.push({
        id: `cjl-${hashId(abs)}`,
        role,
        company,
        location: "See listing",
        sourceName,
        sourceUrl: abs,
        applyUrl: abs,
        dateFound: new Date().toISOString(),
        rawText: abs,
      });
    }
    return {
      health: {
        sourceName,
        status: raw.length ? "ok" : "manual_review",
        itemCount: raw.length,
        ...(raw.length ? {} : { errorMessage: "No /jobs/ links found on homepage HTML." }),
      },
      raw,
    };
  } catch (e) {
    return {
      health: {
        sourceName,
        status: "failed",
        itemCount: 0,
        errorMessage: e instanceof Error ? e.message : "fetch failed",
      },
      raw: [],
    };
  }
}

function ingestRemote3Placeholder(): Promise<{
  health: LiveJobSourceHealth;
  raw: RawJobItem[];
}> {
  return Promise.resolve({
    health: {
      sourceName: "Remote3",
      status: "manual_review",
      itemCount: 0,
      errorMessage:
        "Remote3 listings load client-side (Next.js); no stable job URLs in static HTML for lightweight server fetch.",
    },
    raw: [],
  });
}

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function toManual(raw: RawJobItem, reason: string): NeedsManualReviewJob {
  return {
    id: `manual-${raw.id}`,
    roleHint: raw.role,
    companyHint: raw.company,
    sourceName: raw.sourceName,
    sourceUrl: raw.sourceUrl,
    reason,
  };
}

/**
 * Fetches public listings from configured job boards, filters by SWIFT job profile,
 * and returns clean rows only when apply URLs pass validation.
 */
export async function getLiveJobOpportunities(): Promise<LiveJobIngestionResponse> {
  const checkedAt = new Date().toISOString();

  const [
    w3Remote,
    w3Hr,
    w3UkHr,
    w3LondonHr,
    crypto,
    cjl,
    remote3,
  ] = await Promise.all([
    ingestWeb3CareerPage("https://web3.career/hr+remote-jobs", "Web3.career"),
    ingestWeb3CareerPage("https://web3.career/hr-jobs", "Web3.career HR jobs"),
    ingestWeb3CareerPage(
      "https://web3.career/web3-jobs-united-kingdom%2Bhr",
      "Web3.career UK HR jobs",
    ),
    ingestWeb3CareerPage("https://web3.career/web3-jobs-london%2Bhr", "Web3.career London HR jobs"),
    ingestCryptocurrencyJobsRss(),
    ingestCryptoJobsListHomepage(),
    ingestRemote3Placeholder(),
  ]);

  const sourceHealth = [
    w3Remote.health,
    w3Hr.health,
    w3UkHr.health,
    w3LondonHr.health,
    crypto.health,
    cjl.health,
    remote3.health,
  ];

  const allRaw = [
    ...w3Remote.raw,
    ...w3Hr.raw,
    ...w3UkHr.raw,
    ...w3LondonHr.raw,
    ...crypto.raw,
    ...cjl.raw,
    ...remote3.raw,
  ];
  const rawCount = allRaw.length;

  const opportunities: CleanJobOpportunity[] = [];
  const needsManualReview: NeedsManualReviewJob[] = [];
  const seenApply = new Set<string>();

  for (const raw of allRaw) {
    const implicitIndustryBoard =
      raw.sourceName.startsWith("Web3.career") ||
      raw.sourceName === "Cryptocurrency Jobs" ||
      raw.sourceName === "CryptoJobsList" ||
      raw.sourceName === "Remote3";
    const blob = `${raw.role} ${raw.company} ${raw.location} ${raw.descriptionSnippet ?? ""} ${raw.rawText ?? ""}`;

    const passesRole = matchesRoleProfile(blob);
    const passesInd = matchesIndustryContext(blob, implicitIndustryBoard);
    const passesLoc = matchesLocationProfile(blob);

    if (!passesRole || !passesInd || !passesLoc) {
      continue;
    }

    if (!isRealJobApplyUrl(raw.applyUrl)) {
      needsManualReview.push(toManual(raw, "Apply URL missing or looks like a placeholder."));
      continue;
    }

    if (!isAcceptedIngestionApplyUrl(raw.applyUrl, raw.sourceUrl)) {
      needsManualReview.push(
        toManual(raw, "Apply URL is not on the listing domain, LinkedIn jobs, or a recognised ATS host."),
      );
      continue;
    }

    const clean = finalizeCleanOpportunity(raw);

    const key = clean.applyUrl.toLowerCase();
    if (seenApply.has(key)) continue;
    seenApply.add(key);
    opportunities.push(clean);
  }

  opportunities.sort((a, b) => b.fitScore - a.fitScore || a.role.localeCompare(b.role));

  return {
    status: "ok",
    checkedAt,
    rawCount,
    cleanCount: opportunities.length,
    opportunities,
    needsManualReview,
    sourceHealth,
  };
}
