import { XMLParser } from "fast-xml-parser";

import { getRssSources } from "@/lib/sourceRegistry";
import type {
  CleanMarketSignal,
  MarketCategory,
  RawMarketItem,
  SourceHealthResult,
  SourceHealthStatus,
} from "@/lib/types";

type RssSource = ReturnType<typeof getRssSources>[number];

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return trimmed.length ? trimmed : undefined;
}

function pickLink(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim() || undefined;

  if (Array.isArray(value)) {
    for (const v of value) {
      const picked = pickLink(v);
      if (picked) return picked;
    }
    return undefined;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const href = obj["@_href"];
    if (typeof href === "string" && href.trim()) return href.trim();
    const url = obj["url"];
    if (typeof url === "string" && url.trim()) return url.trim();
  }

  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function stableId(seed: string) {
  return seed
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function parseFeedXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: true,
    parseAttributeValue: true,
    allowBooleanAttributes: true,
  });

  return parser.parse(xml) as Record<string, unknown>;
}

function normalizeRssItems(parsed: Record<string, unknown>) {
  const rss = parsed["rss"] as Record<string, unknown> | undefined;
  const channel = rss?.["channel"] as Record<string, unknown> | undefined;
  const items = channel?.["item"];
  return asArray(items as unknown);
}

function normalizeAtomEntries(parsed: Record<string, unknown>) {
  const feed = parsed["feed"] as Record<string, unknown> | undefined;
  const entries = feed?.["entry"];
  return asArray(entries as unknown);
}

function extractFeedEntries(parsed: Record<string, unknown>) {
  const rssEntries = normalizeRssItems(parsed);
  const atomEntries = normalizeAtomEntries(parsed);
  return [...rssEntries, ...atomEntries];
}

async function fetchAndParseSource(source: RssSource) {
  const res = await fetch(source.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parseFeedXml(xml);
  const entries = extractFeedEntries(parsed);
  return { parsed, entries };
}

function normalizeRawItem({
  source,
  entry,
}: {
  source: RssSource;
  entry: unknown;
}): RawMarketItem | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;

  const title = cleanText(obj["title"]);

  const url =
    pickLink(obj["link"]) ||
    cleanText(obj["link"]) ||
    pickLink(obj["guid"]) ||
    cleanText(obj["guid"]);

  if (!title || !url) return null;

  const publishedAt =
    toIsoDate(obj["pubDate"]) ||
    toIsoDate(obj["published"]) ||
    toIsoDate(obj["updated"]) ||
    toIsoDate(obj["date"]);

  const rawSummary =
    cleanText(obj["description"]) || cleanText(obj["summary"]) || cleanText(obj["subtitle"]);

  const rawContent =
    cleanText(obj["content"]) ||
    cleanText((obj["content:encoded"] as unknown) ?? obj["encoded"]) ||
    cleanText(obj["content_encoded"]);

  const id = stableId(`${source.id}_${url}`) || stableId(`${source.id}_${title}`);

  return {
    id,
    sourceId: source.id,
    sourceName: source.name,
    title,
    url,
    publishedAt,
    rawSummary,
    rawContent,
  };
}

export async function fetchRssSources(): Promise<RawMarketItem[]> {
  const sources = getRssSources().filter((s) => s.enabled);
  const items: RawMarketItem[] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const { entries } = await fetchAndParseSource(source);
        const normalized = entries.map((entry) => normalizeRawItem({ source, entry }));
        for (const raw of normalized) {
          if (raw) items.push(raw);
        }
      } catch (error) {
        console.warn(`[swift] RSS source failed: ${source.name}`, error);
      }
    }),
  );

  return items;
}

export async function getRssSourceHealth(): Promise<SourceHealthResult[]> {
  const checkedAt = new Date().toISOString();
  const sources = getRssSources();

  const results = await Promise.all(
    sources.map(async (source) => {
      if (!source.enabled) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
          status: "disabled" as const satisfies SourceHealthStatus,
          itemCount: 0,
          checkedAt,
        };
      }

      try {
        const { entries } = await fetchAndParseSource(source);
        return {
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
          status: "ok" as const satisfies SourceHealthStatus,
          itemCount: entries.length,
          checkedAt,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
        return {
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
          status: "failed" as const satisfies SourceHealthStatus,
          itemCount: 0,
          errorMessage: message,
          checkedAt,
        };
      }
    }),
  );

  return results;
}

const WEB3_AI_KEYWORDS = [
  "crypto",
  "web3",
  "digital asset",
  "exchange",
  "stablecoin",
  "token",
  "blockchain",
  "defi",
  "tradfi",
  "custody",
  "wallet",
  "regulation",
  "compliance",
  "institutional",
  "bitcoin",
  "ethereum",
  "ai",
  "artificial intelligence",
  "agent",
  "agents",
  "automation",
  "llm",
  "openai",
] as const;

const HRBP_KEYWORDS = [
  "hr",
  "people",
  "talent",
  "workforce",
  "hiring",
  "layoff",
  "layoffs",
  "recruitment",
  "compensation",
  "reward",
  "performance",
  "leadership",
  "manager",
  "culture",
  "engagement",
  "skills",
  "learning",
  "capability",
  "organisation design",
  "organization design",
  "org design",
  "workforce planning",
  "succession",
  "retention",
  "employee relations",
  "dei",
  "inclusion",
] as const;

const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: "Web3", keywords: ["web3", "blockchain", "defi", "token", "stablecoin", "wallet"] },
  { tag: "AI", keywords: ["ai", "artificial intelligence", "agent", "agents", "llm", "openai"] },
  { tag: "Regulation", keywords: ["regulation"] },
  { tag: "Compliance", keywords: ["compliance"] },
  { tag: "Talent", keywords: ["talent", "recruitment", "retention", "succession"] },
  { tag: "Hiring", keywords: ["hiring", "layoff", "layoffs"] },
  { tag: "Workforce Planning", keywords: ["workforce", "workforce planning"] },
  { tag: "Leadership", keywords: ["leadership", "manager"] },
  { tag: "Reward", keywords: ["compensation", "reward"] },
  { tag: "Skills", keywords: ["skills", "learning", "capability"] },
  { tag: "Org Design", keywords: ["org design", "organisation design", "organization design"] },
];

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function withinDays(iso: string, days: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

function withinHours(iso: string, hours: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

function countKeywordHits(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function scoreItem({
  title,
  body,
  category,
  publishedAt,
}: {
  title: string;
  body: string;
  category: MarketCategory;
  publishedAt?: string;
}) {
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();

  const keywordSet = category === "hrbp" ? HRBP_KEYWORDS : WEB3_AI_KEYWORDS;

  let score = 0;
  for (const kw of keywordSet) {
    score += 2 * countKeywordHits(titleLower, kw);
    score += 1 * countKeywordHits(bodyLower, kw);
  }

  const mentionsAI =
    bodyLower.includes("ai") ||
    bodyLower.includes("artificial intelligence") ||
    bodyLower.includes("automation") ||
    titleLower.includes("ai") ||
    titleLower.includes("automation");
  const mentionsReg =
    bodyLower.includes("regulation") ||
    bodyLower.includes("compliance") ||
    bodyLower.includes("institutional") ||
    titleLower.includes("regulation") ||
    titleLower.includes("compliance") ||
    titleLower.includes("institutional");

  if (category === "web3_ai" && mentionsAI) score += 2;
  if (category === "web3_ai" && mentionsReg) score += 2;

  if (category === "hrbp") {
    const hrBoost =
      bodyLower.includes("skills") ||
      bodyLower.includes("workforce") ||
      bodyLower.includes("planning") ||
      bodyLower.includes("leadership") ||
      titleLower.includes("skills") ||
      titleLower.includes("workforce") ||
      titleLower.includes("leadership");
    if (hrBoost) score += 2;
  }

  if (publishedAt && withinHours(publishedAt, 48)) score += 1;
  if (!publishedAt) score = Math.max(0, score - 1);

  return Math.min(10, score);
}

function tagsForText(text: string) {
  const lower = text.toLowerCase();
  const tags = new Set<string>();
  for (const rule of TAG_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) tags.add(rule.tag);
    }
  }
  return Array.from(tags);
}

function signalStrength(score: number): "Weak" | "Moderate" | "Strong" {
  if (score >= 7) return "Strong";
  if (score >= 4) return "Moderate";
  return "Weak";
}

function whyItMattersFor(tags: string[]) {
  if (tags.includes("Regulation") || tags.includes("Compliance")) {
    return "This matters because regulated growth changes the capabilities Web3 companies need to build.";
  }
  if (tags.includes("AI")) {
    return "This matters because AI adoption is reshaping operating models and talent expectations.";
  }
  if (tags.includes("Hiring") || tags.includes("Talent")) {
    return "This matters because market demand signals can inform workforce planning and capability priorities.";
  }
  return "This matters because it may signal a shift in market priorities, business models, or capability demand.";
}

function hrbpImplicationFor(tags: string[]) {
  if (tags.includes("Regulation") || tags.includes("Compliance")) {
    return "HRBPs should watch for increased demand in compliance, risk, legal, and institutional client capability.";
  }
  if (tags.includes("AI")) {
    return "HRBPs should identify which roles need AI literacy and which workflows can be augmented.";
  }
  if (tags.includes("Hiring") || tags.includes("Talent")) {
    return "HRBPs should compare hiring signals against current capability gaps and talent plans.";
  }
  return "HRBPs should monitor whether this creates new capability, leadership, or workforce planning implications.";
}

export function cleanMarketSignals(rawItems: RawMarketItem[]): CleanMarketSignal[] {
  const recent: RawMarketItem[] = rawItems.filter((item) => {
    if (!item.title?.trim() || !item.url?.trim()) return false;
    if (!item.publishedAt) return true;
    return withinDays(item.publishedAt, 7);
  });

  const byUrl = new Map<string, RawMarketItem>();
  for (const item of recent) {
    const url = item.url.trim();
    if (!byUrl.has(url)) byUrl.set(url, item);
  }

  const byTitle = new Map<string, RawMarketItem>();
  for (const item of byUrl.values()) {
    const key = normalizeTitle(item.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, item);
  }

  const sourcesById = new Map(getRssSources().map((s) => [s.id, s]));

  const cleaned: CleanMarketSignal[] = [];
  for (const item of byTitle.values()) {
    const source = sourcesById.get(item.sourceId);
    const category: MarketCategory = source?.category ?? "web3_ai";

    const body = [item.rawSummary, item.rawContent].filter(Boolean).join(" ");
    const score = scoreItem({
      title: item.title,
      body,
      category,
      publishedAt: item.publishedAt,
    });

    if (score < 3) continue;

    const tags = tagsForText(`${item.title} ${body}`);
    const summary =
      cleanText(item.rawSummary) ??
      cleanText(item.rawContent) ??
      `Signal detected: ${item.title}`;

    const id = stableId(`${item.sourceId}_${item.url}`) || stableId(item.title);

    cleaned.push({
      id,
      title: item.title,
      sourceName: item.sourceName,
      url: item.url,
      publishedAt: item.publishedAt,
      category,
      tags,
      relevanceScore: score,
      signalStrength: signalStrength(score),
      summary,
      whyItMatters: whyItMattersFor(tags),
      hrbpImplication: hrbpImplicationFor(tags),
    });
  }

  cleaned.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return cleaned;
}

export async function getCleanedMarketSignals(): Promise<CleanMarketSignal[]> {
  try {
    const raw = await fetchRssSources();
    return cleanMarketSignals(raw);
  } catch (error) {
    console.warn("[swift] getCleanedMarketSignals failed", error);
    return [];
  }
}

