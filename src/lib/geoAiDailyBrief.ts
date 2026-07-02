import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import {
  extractFirstBalancedJsonObject,
  invokeAiJsonStrict,
  isAiConfigured,
  stripMarkdownFences,
} from "@/lib/aiProvider";
import { isLikelyArticleUrl, resolveGoogleNewsUrl } from "@/lib/dailyMarketArticleFetcher";
import { getLatestRuns, saveIntelligenceRun } from "@/lib/intelligenceStorage";
import { runGuardedFetch } from "@/lib/imapFetchGuard";

const DEFAULT_LABEL = "Daily Career Intel Digest for ChatGPT";
const MAX_EMAILS = 4;
const MAX_LINKS = 14;
const MAX_EMAIL_CHARS = 28_000;
const MAX_PAGE_CHARS = 36_000;
const FETCH_TIMEOUT_MS = 10_000;

export type GeoAiBriefSource = {
  title: string;
  url?: string;
  source?: string;
  fetched?: boolean;
};

export type GeoAiDailyBrief = {
  reportType: "geo_ai_daily_brief";
  title: "GEO x AI Daily Brief";
  generatedAt: string;
  lastUpdatedAt: string;
  headline: string;
  executiveSummary: string;
  keyDevelopments: string[];
  implications: string[];
  recommendedActions: string[];
  sources: GeoAiBriefSource[];
  diagnostics: {
    label: string;
    emailsRead: number;
    linksFound: number;
    linksFetched: number;
    storageSaved?: boolean;
    storageError?: string;
  };
};

type ParsedDigestEmail = {
  subject: string;
  from: string;
  date: string;
  text: string;
  links: GeoAiBriefSource[];
};

function getGmailLabelName() {
  return (
    process.env.GMAIL_LABEL_NAME?.trim() ||
    process.env.GMAIL_DAILY_MARKET_INTEL_LABEL?.trim() ||
    DEFAULT_LABEL
  );
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\""),
  );
}

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function cleanUrl(url: string): string {
  return url.trim().replace(/[)\]>"'<.,;:!?]+$/g, "");
}

function shouldSkipUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    !/^https?:\/\//i.test(url) ||
    u.includes("unsubscribe") ||
    u.includes("email-settings") ||
    u.includes("/privacy") ||
    u.includes("/terms") ||
    /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|pdf)(\?|#|$)/i.test(u)
  );
}

function extractLinks(html: string, text: string): GeoAiBriefSource[] {
  const out: GeoAiBriefSource[] = [];
  const seen = new Set<string>();
  const add = (title: string, rawUrl: string) => {
    const url = cleanUrl(rawUrl);
    if (shouldSkipUrl(url)) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      title: normalizeWhitespace(stripHtml(title || url)).slice(0, 180) || sourceFromUrl(url),
      url,
      source: sourceFromUrl(url),
    });
  };

  const anchorRe = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    add(m[3] ?? "", m[1] ?? m[2] ?? "");
  }

  for (const url of text.match(/https?:\/\/[^\s\])"'<>]+/gi) ?? []) {
    add(url, url);
  }

  return out.slice(0, MAX_LINKS);
}

async function fetchDigestEmails(): Promise<{ label: string; emails: ParsedDigestEmail[] }> {
  return runGuardedFetch({
    key: "geo-ai-daily-brief-gmail",
    logPrefix: "[GEO_AI_BRIEF]",
    fallback: () => ({ label: getGmailLabelName(), emails: [] }),
    run: async () => {
      const user = process.env.GMAIL_USER;
      const pass = process.env.GMAIL_APP_PASSWORD;
      const label = getGmailLabelName();

      if (!user || !pass) {
        console.warn("[GEO_AI_BRIEF] Gmail credentials missing");
        return { label, emails: [] };
      }

      const client = new ImapFlow({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user, pass },
      });
      let mailboxLock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null = null;

      try {
        await client.connect();
        mailboxLock = await client.getMailboxLock(label);
        const messages = client.fetch(
          { since: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) },
          { envelope: true, source: true },
        );
        const emails: ParsedDigestEmail[] = [];

        for await (const message of messages) {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const html = typeof parsed.html === "string" ? parsed.html : "";
          const text = typeof parsed.text === "string" ? parsed.text : stripHtml(html);
          const bodyText = normalizeWhitespace(text || stripHtml(html));
          if (!bodyText) continue;

          emails.push({
            subject: parsed.subject || "Untitled digest",
            from: parsed.from?.text || "Unknown sender",
            date: parsed.date?.toISOString() || new Date().toISOString(),
            text: bodyText.slice(0, 12_000),
            links: extractLinks(html, text),
          });
        }

        emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { label, emails: emails.slice(0, MAX_EMAILS) };
      } catch (error) {
        console.error("[GEO_AI_BRIEF] Gmail fetch failed", error);
        return { label, emails: [] };
      } finally {
        if (mailboxLock) mailboxLock.release();
        await client.logout().catch(() => undefined);
      }
    },
  });
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SWIFT/1.0 (GEO x AI Daily Brief)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchReadablePages(links: GeoAiBriefSource[]) {
  const fetched: Array<GeoAiBriefSource & { text: string }> = [];
  for (const link of links.slice(0, MAX_LINKS)) {
      const originalUrl = link.url;
      if (!originalUrl) continue;
      try {
      const resolved = await resolveGoogleNewsUrl(originalUrl, link.title).catch(() => ({
        resolvedUrl: originalUrl,
        resolvedOk: false,
        resolvedSource: sourceFromUrl(originalUrl),
        rejectedAssetCount: 0,
        rejectedNonArticleCount: 0,
        rejectedPublisherMismatchCount: 0,
      }));
      const url = resolved.resolvedUrl || originalUrl;
      if (!isLikelyArticleUrl(url)) continue;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const html = await res.text();
      const text = stripHtml(html);
      if (text.length < 220) continue;
      fetched.push({
        ...link,
        url,
        source: sourceFromUrl(url),
        fetched: true,
        text: text.slice(0, 7_000),
      });
    } catch {
      // Failed or blocked links are intentionally ignored.
    }
  }
  return fetched;
}

function parseBriefJson(raw: string): Omit<
  GeoAiDailyBrief,
  "reportType" | "title" | "generatedAt" | "lastUpdatedAt" | "diagnostics"
> {
  const fenced = stripMarkdownFences(raw);
  const jsonText = extractFirstBalancedJsonObject(fenced) ?? fenced;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const strings = (value: unknown, fallback: string[] = []) =>
    Array.isArray(value)
      ? value.map((x) => (typeof x === "string" ? normalizeWhitespace(x) : "")).filter(Boolean).slice(0, 6)
      : fallback;
  const sources =
    Array.isArray(parsed.sources)
      ? parsed.sources
          .map((x) => {
            if (!x || typeof x !== "object") return null;
            const o = x as Record<string, unknown>;
            return {
              title: typeof o.title === "string" ? normalizeWhitespace(o.title).slice(0, 180) : "Source",
              url: typeof o.url === "string" ? o.url : undefined,
              source: typeof o.source === "string" ? o.source : undefined,
              fetched: typeof o.fetched === "boolean" ? o.fetched : undefined,
            };
          })
          .filter(Boolean)
          .slice(0, 12)
          .map((x) => x as GeoAiBriefSource)
      : [];

  return {
    headline:
      typeof parsed.headline === "string" && parsed.headline.trim()
        ? normalizeWhitespace(parsed.headline)
        : "GEO and AI search signals reviewed.",
    executiveSummary:
      typeof parsed.executiveSummary === "string" && parsed.executiveSummary.trim()
        ? normalizeWhitespace(parsed.executiveSummary)
        : "",
    keyDevelopments: strings(parsed.keyDevelopments),
    implications: strings(parsed.implications),
    recommendedActions: strings(parsed.recommendedActions),
    sources,
  };
}

function buildPrompt(args: {
  emails: ParsedDigestEmail[];
  pages: Array<GeoAiBriefSource & { text: string }>;
}) {
  const emailText = args.emails
    .map((email, idx) =>
      [
        `EMAIL ${idx + 1}`,
        `Subject: ${email.subject}`,
        `From: ${email.from}`,
        `Date: ${email.date}`,
        `Body: ${email.text}`,
        `Links: ${email.links.map((l) => `${l.title} (${l.url})`).join("; ")}`,
      ].join("\n"),
    )
    .join("\n\n")
    .slice(0, MAX_EMAIL_CHARS);

  const pageText = args.pages
    .map((page, idx) =>
      [
        `PAGE ${idx + 1}`,
        `Title: ${page.title}`,
        `Source: ${page.source}`,
        `URL: ${page.url}`,
        `Readable text: ${page.text}`,
      ].join("\n"),
    )
    .join("\n\n")
    .slice(0, MAX_PAGE_CHARS);

  return {
    system: [
      "You are SWIFT's executive GEO and AI-search intelligence analyst.",
      "Return strict JSON only. Do not include markdown.",
      "Focus on Generative Engine Optimization, AI Search, AI visibility, AI Ads, AI discovery, and answer engines.",
      "Mention Semrush or Adobe only when present in the evidence.",
      "Mention HRBP, GTM, or Sales implications only where clearly relevant.",
      "Do not add Web3, crypto, employment-law, expansion, or downsizing sections.",
    ].join(" "),
    user: [
      "Create the latest GEO x AI Daily Brief from these Gmail digests and fetched linked pages.",
      "Use this exact JSON shape:",
      "{",
      '  "headline": "one executive headline",',
      '  "executiveSummary": "4-7 sentence executive-quality summary",',
      '  "keyDevelopments": ["3-5 concise developments"],',
      '  "implications": ["2-4 implications for GEO/AI visibility/AI ads/discovery"],',
      '  "recommendedActions": ["2-4 concrete actions for this week"],',
      '  "sources": [{"title":"source title","url":"https://...","source":"publisher","fetched":true}]',
      "}",
      "",
      "GMAIL DIGESTS:",
      emailText || "No digest body available.",
      "",
      "FETCHED LINKED PAGES:",
      pageText || "No linked pages could be fetched; rely only on email content.",
    ].join("\n"),
  };
}

export async function getLatestGeoAiDailyBrief(): Promise<{
  brief: GeoAiDailyBrief | null;
  storageConfigured: boolean;
  error?: string;
}> {
  const latest = await getLatestRuns(30);
  const row = latest.runs.find((run) => {
    const report = run.report_json;
    return Boolean(report && typeof report === "object" && (report as Record<string, unknown>).reportType === "geo_ai_daily_brief");
  });
  if (!row) return { brief: null, storageConfigured: !latest.error, error: latest.error };
  const report = row.report_json as GeoAiDailyBrief;
  return { brief: report, storageConfigured: true };
}

export async function generateGeoAiDailyBrief(): Promise<{
  brief: GeoAiDailyBrief | null;
  storage: { saved: boolean; runId?: string; error?: string };
  empty?: boolean;
}> {
  if (!isAiConfigured()) {
    throw new Error("DeepSeek AI provider is not configured");
  }

  const { label, emails } = await fetchDigestEmails();
  if (!emails.length) {
    return {
      brief: null,
      empty: true,
      storage: { saved: false, error: "No recent emails found under Gmail label" },
    };
  }

  const allLinks = emails.flatMap((email) => email.links);
  const pages = await fetchReadablePages(allLinks);
  const prompt = buildPrompt({ emails, pages });
  const aiText = await invokeAiJsonStrict({ ...prompt, temperature: 0.2, maxTokens: 1800 });
  const generatedAt = new Date().toISOString();
  const parsed = parseBriefJson(aiText);

  const sourceByUrl = new Map<string, GeoAiBriefSource>();
  for (const source of [...parsed.sources, ...pages, ...allLinks]) {
    if (!source.url) continue;
    sourceByUrl.set(source.url, {
      title: source.title,
      url: source.url,
      source: source.source,
      fetched: source.fetched,
    });
  }

  const brief: GeoAiDailyBrief = {
    reportType: "geo_ai_daily_brief",
    title: "GEO x AI Daily Brief",
    generatedAt,
    lastUpdatedAt: generatedAt,
    ...parsed,
    sources: Array.from(sourceByUrl.values()).slice(0, 12),
    diagnostics: {
      label,
      emailsRead: emails.length,
      linksFound: allLinks.length,
      linksFetched: pages.length,
    },
  };

  const storage = await saveIntelligenceRun({
    runType: "manual",
    report: brief as unknown as Record<string, unknown>,
    rawSignalCount: allLinks.length,
    cleanSignalCount: pages.length,
    marketSignals: brief.sources.map((source) => ({
      title: source.title,
      url: source.url,
      sourceName: source.source,
      category: "geo_ai_daily_brief",
      publishedAt: generatedAt,
      summary: brief.headline,
      whyItMatters: brief.executiveSummary,
      hrbpImplication: brief.implications.join(" "),
    })),
  });

  brief.diagnostics.storageSaved = storage.saved;
  if (storage.error) brief.diagnostics.storageError = storage.error;

  return { brief, storage };
}
