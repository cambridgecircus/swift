import { resolveGoogleNewsUrl } from "@/lib/dailyMarketArticleFetcher";
import { getLatestRuns, saveIntelligenceRun } from "@/lib/intelligenceStorage";

const EXPECTED_GMAIL_ACCOUNT = "cambridgecircus@gmail.com";
const DEFAULT_SOURCE_LABEL = "CareerIntel/Market";
const DEFAULT_DIGEST_LABEL = "Daily Career Intel Digest for ChatGPT";
const DEFAULT_DIGEST_TO = EXPECTED_GMAIL_ACCOUNT;
const GOOGLE_ALERTS_FROM = "googlealerts-noreply@google.com";
const FALLBACK_SEARCH_WINDOW_DAYS = 7;
const DEFAULT_LOOKBACK_HOURS = 48;
const MAX_LINKS = 12;
const ARTICLE_FETCH_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ARTICLE_CHARS = 5_500;
const MAX_ARTICLE_PROMPT_CHARS = 48_000;
const MAX_EMAIL_PROMPT_CHARS = 18_000;
const MAX_DISPLAY_SOURCES = 5;
const MAX_EXECUTIVE_SIGNAL_CHARS = 1_200;
const MAX_SECTION_CHARS = 1_500;
const MAX_SOURCE_TITLE_CHARS = 200;
const MAX_SOURCE_SNIPPET_CHARS = 180;
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

type BriefTrigger = "manual" | "scheduled";
type AiProviderName = "deepseek" | "openai";

type AiConfig = {
  provider: AiProviderName;
  apiKey?: string;
  baseUrl: string;
  model: string;
};

type GoogleAlertEmail = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  internalDate: number;
  text: string;
  html: string;
  links: ExtractedAlertLink[];
};

type ExtractedAlertLink = {
  title: string;
  publication: string;
  url: string;
  originalUrl: string;
  snippet: string;
  emailSubject: string;
  emailDate: string;
};

type ArticleInput = ExtractedAlertLink & {
  finalUrl: string;
  content: string;
  contentFetched: boolean;
  contentUnavailableReason?: string;
};

export type GeoAiBriefSource = {
  title: string;
  publication: string;
  publisher?: string;
  domain?: string;
  url: string;
  shortSummary: string;
  relevanceReason: string;
  contentFetched: boolean;
  fetchStatus?: string;
};

export type GeoAiBriefCompactSource = {
  title: string;
  publisher: string;
  domain: string;
  url: string;
  fetchStatus: string;
  snippet?: string;
};

export type GeoAiBriefDebugSummary = {
  triggerType: BriefTrigger;
  gmailAccount: string;
  labelFound: boolean;
  latestGoogleAlertSubject?: string;
  latestGoogleAlertTimestamp?: string;
  articleLinksExtracted: number;
  articleLinksFetched: number;
  aiProvider: string;
  model: string;
  fallbackUsed: boolean;
  emailSent: boolean;
};

export type GeoAiDailyBriefDebug = {
  authenticatedGmailAccount?: string;
  expectedGmailAccount: string;
  accountMatched: boolean;
  configuredGmailUser?: string;
  configuredGmailUserMatched?: boolean;
  careerIntelMarketLabelExists: boolean;
  careerIntelMarketLabelId?: string;
  careerIntelMarketLabelName?: string;
  labelSearchMessagesFound: number;
  fallbackSearchMessagesFound: number;
  successfulGmailQuery?: string;
  latestGoogleAlertSubject?: string;
  latestGoogleAlertTimestamp?: string;
  articleLinksExtracted: number;
  articleLinksFetched: number;
  aiProviderUsed?: string;
  aiModelUsed?: string;
  fallbackBriefUsed: boolean;
  fetchErrors: string[];
  error?: string;
  logs: string[];
};

export type GeoAiDailyBrief = {
  reportType: "geo_ai_daily_brief";
  title: "GEO x AI Daily Brief";
  generatedAt: string;
  lastUpdatedAt: string;
  digestDate: string;
  trigger: BriefTrigger;
  headline: string;
  executiveSignal: string;
  whatHappenedToday: string;
  whyItMattersForSemrushAdobe: string;
  gtmSalesImplication: string;
  hrbpImplication: string;
  recommendedAction: string;
  oneLineSummary: string;
  executiveSummary: string;
  topSignals: string[];
  marketMovement: string;
  geoAiSearchAdsImplications: string;
  semrushAdobeRelevance: string;
  hrbpOrgHiringRelevance: string;
  sources: GeoAiBriefCompactSource[];
  sourceLinks: GeoAiBriefSource[];
  warnings: string[];
  email: {
    to: string;
    subject: string;
    sent: boolean;
    labelApplied: boolean;
    messageId?: string;
    error?: string;
  };
  gmailDebug: GeoAiDailyBriefDebug;
  debug: GeoAiBriefDebugSummary;
  diagnostics: {
    sourceLabel: string;
    digestLabel: string;
    lookbackHours: number;
    gmailMessagesFound: number;
    googleAlertMessagesProcessed: number;
    linksExtracted: number;
    articlesFetched: number;
    articleFetchFailures: number;
    aiProvider: string;
    aiModel: string;
    fallbackBriefUsed: boolean;
    storageSaved?: boolean;
    storageError?: string;
    duplicateScheduledEmailSkipped?: boolean;
  };
};

type OpenAiSourceLink = {
  title: string;
  publication: string;
  url: string;
  shortSummary: string;
  relevanceReason: string;
  contentFetched: boolean;
};

type OpenAiBriefPayload = {
  executiveSignal: string;
  whatHappenedToday: string;
  whyItMattersForSemrushAdobe: string;
  gtmSalesImplication: string;
  hrbpImplication: string;
  recommendedAction: string;
  oneLineSummary: string;
  sourceLinks: OpenAiSourceLink[];
};

type BriefSectionKey =
  | "executiveSignal"
  | "whatHappenedToday"
  | "whyItMattersForSemrushAdobe"
  | "gtmSalesImplication"
  | "hrbpImplication"
  | "recommendedAction"
  | "oneLineSummary";

const REQUIRED_BRIEF_FIELDS: BriefSectionKey[] = [
  "executiveSignal",
  "whatHappenedToday",
  "whyItMattersForSemrushAdobe",
  "gtmSalesImplication",
  "hrbpImplication",
  "recommendedAction",
  "oneLineSummary",
];

type GenerateGeoAiDailyBriefOptions = {
  trigger?: BriefTrigger;
  lookbackHours?: number;
  sendEmail?: boolean;
  forceSendEmail?: boolean;
};

type GenerateGeoAiDailyBriefResult = {
  brief: GeoAiDailyBrief | null;
  storage: { saved: boolean; runId?: string; error?: string };
  empty?: boolean;
  duplicateSkipped?: boolean;
  message?: string;
  debug?: GeoAiDailyBriefDebug;
};

type GmailTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GmailProfile = {
  emailAddress?: string;
};

type GmailLabel = {
  id: string;
  name: string;
};

type GmailLabelsResponse = {
  labels?: GmailLabel[];
};

type GmailMessageListItem = {
  id: string;
  threadId?: string;
};

type GmailMessageListResponse = {
  messages?: GmailMessageListItem[];
  resultSizeEstimate?: number;
};

type GmailHeader = {
  name: string;
  value: string;
};

type GmailBody = {
  data?: string;
};

type GmailPayload = {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPayload[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

type AiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

type GmailSendMessageResponse = {
  id?: string;
  threadId?: string;
};

class GeoAiBriefGenerationError extends Error {
  debug: GeoAiDailyBriefDebug;

  constructor(message: string, debug: GeoAiDailyBriefDebug) {
    super(message);
    this.name = "GeoAiBriefGenerationError";
    this.debug = debug;
  }
}

export function getGeoAiBriefErrorDebug(error: unknown): GeoAiDailyBriefDebug | undefined {
  return error instanceof GeoAiBriefGenerationError ? error.debug : undefined;
}

function getSourceLabelName() {
  return (
    process.env.GMAIL_MARKET_LABEL?.trim() ||
    process.env.GMAIL_SOURCE_LABEL?.trim() ||
    DEFAULT_SOURCE_LABEL
  );
}

function getDigestLabelName() {
  return (
    process.env.GMAIL_DIGEST_LABEL?.trim() ||
    process.env.GMAIL_OUTPUT_LABEL?.trim() ||
    DEFAULT_DIGEST_LABEL
  );
}

function getDigestRecipient() {
  return process.env.GMAIL_DIGEST_TO?.trim() || DEFAULT_DIGEST_TO;
}

function getAiConfig(): AiConfig {
  const requested = process.env.AI_PROVIDER?.trim().toLowerCase();
  const provider: AiProviderName =
    requested === "openai"
      ? "openai"
      : requested === "deepseek"
        ? "deepseek"
        : process.env.DEEPSEEK_API_KEY?.trim()
          ? "deepseek"
          : "openai";

  if (provider === "deepseek") {
    return {
      provider,
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
      baseUrl: (
        process.env.DEEPSEEK_BASE_URL?.trim() ||
        process.env.AI_BASE_URL?.trim() ||
        DEFAULT_DEEPSEEK_BASE_URL
      ).replace(/\/+$/g, ""),
      model:
        process.env.DEEPSEEK_MODEL?.trim() ||
        process.env.AI_MODEL?.trim() ||
        DEFAULT_DEEPSEEK_MODEL,
    };
  }

  return {
    provider,
    apiKey: process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim(),
    baseUrl: (
      process.env.OPENAI_BASE_URL?.trim() ||
      process.env.AI_BASE_URL?.trim() ||
      OPENAI_BASE_URL
    ).replace(/\/+$/g, ""),
    model: process.env.OPENAI_MODEL?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
  };
}

function getAiChatCompletionsUrl(config: AiConfig) {
  return `${config.baseUrl}/chat/completions`;
}

function createDebug(): GeoAiDailyBriefDebug {
  return {
    expectedGmailAccount: EXPECTED_GMAIL_ACCOUNT,
    accountMatched: false,
    configuredGmailUser: process.env.GMAIL_USER?.trim() || undefined,
    configuredGmailUserMatched:
      !process.env.GMAIL_USER?.trim() ||
      process.env.GMAIL_USER.trim().toLowerCase() === EXPECTED_GMAIL_ACCOUNT,
    careerIntelMarketLabelExists: false,
    labelSearchMessagesFound: 0,
    fallbackSearchMessagesFound: 0,
    articleLinksExtracted: 0,
    articleLinksFetched: 0,
    fallbackBriefUsed: false,
    fetchErrors: [],
    logs: [],
  };
}

function logDebug(debug: GeoAiDailyBriefDebug, message: string) {
  debug.logs.push(message);
  console.log(`[GEO_AI_BRIEF] ${message}`);
}

function failWithDebug(debug: GeoAiDailyBriefDebug, message: string): never {
  debug.error = message;
  console.error(`[GEO_AI_BRIEF] ${message}`);
  throw new GeoAiBriefGenerationError(message, debug);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function stripHtml(html: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function cleanText(input: string, fallback = ""): string {
  return normalizeWhitespace(stripHtml(input || fallback));
}

function truncateText(input: string | null | undefined, maxLength: number): string {
  const text = normalizeWhitespace(input || "");
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  const breakAt = sentenceEnd > Math.floor(maxLength * 0.55) ? sentenceEnd + 1 : maxLength;
  return `${slice.slice(0, breakAt).trim().replace(/[,:;.-]+$/g, "")}...`;
}

function sanitizeBriefText(input: string | null | undefined, maxLength = MAX_SECTION_CHARS): string {
  const withoutMarkdownLinks = String(input || "").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, "$1");
  const withoutBareUrls = withoutMarkdownLinks.replace(/https?:\/\/[^\s\])"'<>]+/gi, "");
  return truncateText(cleanText(withoutBareUrls), maxLength);
}

function sourceDomain(url: string): string {
  return sourceFromUrl(url);
}

function cleanSourceTitle(title: string, url: string): string {
  const cleaned = cleanText(title);
  const fallback = sourceDomain(url);
  if (!cleaned || /^https?:\/\//i.test(cleaned) || cleaned.length > 280) {
    return fallback;
  }
  return truncateText(cleaned, MAX_SOURCE_TITLE_CHARS);
}

function cleanUrl(input: string): string {
  return decodeHtmlEntities(input)
    .trim()
    .replace(/[\])}"'<.,;:!?]+$/g, "");
}

function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function unwrapGoogleRedirectUrl(input: string): string {
  let url = cleanUrl(input);
  for (let i = 0; i < 4; i += 1) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      if (host.endsWith("google.com") && path.startsWith("/amp/")) {
        const stripped = parsed.pathname.replace(/^\/amp\/s?\//i, "");
        url = `${path.startsWith("/amp/s/") ? "https" : "http"}://${stripped}${parsed.search}`;
        continue;
      }

      const directParam =
        parsed.searchParams.get("url") ||
        parsed.searchParams.get("q") ||
        parsed.searchParams.get("u");
      if (directParam && isHttpUrl(directParam)) {
        url = directParam;
        continue;
      }
    } catch {
      return url;
    }
    break;
  }
  return cleanUrl(url);
}

function cleanArticleUrl(input: string): string {
  return withoutTrackingParams(unwrapGoogleRedirectUrl(input));
}

function withoutTrackingParams(input: string): string {
  try {
    const url = new URL(input);
    const trackingPrefixes = ["utm_"];
    const trackingParams = new Set([
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "igshid",
      "ref",
      "source",
    ]);

    for (const key of Array.from(url.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (trackingParams.has(lower) || trackingPrefixes.some((prefix) => lower.startsWith(prefix))) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return input;
  }
}

function urlKey(input: string): string {
  return withoutTrackingParams(input).replace(/\/$/g, "").toLowerCase();
}

function isUtilityLink(rawUrl: string, labelText: string): boolean {
  const unwrapped = unwrapGoogleRedirectUrl(rawUrl);
  const haystack = `${rawUrl} ${unwrapped} ${labelText}`.toLowerCase();
  if (!isHttpUrl(unwrapped)) return true;
  if (
    haystack.includes("unsubscribe") ||
    haystack.includes("send feedback") ||
    haystack.includes("view all alerts") ||
    haystack.includes("edit this alert") ||
    haystack.includes("see more results") ||
    haystack.includes("flag as irrelevant") ||
    haystack.includes("privacy") ||
    haystack.includes("terms") ||
    haystack.includes("rss feed")
  ) {
    return true;
  }

  try {
    const url = new URL(unwrapped);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === "mail.google.com" || host.endsWith(".mail.google.com")) return true;
    if (host === "accounts.google.com" || host.endsWith(".accounts.google.com")) return true;
    if (host.endsWith("google.com") && path === "/url") return true;
    if (host === "s.openai.com") return true;
    if (
      host === "alerts.google.com" ||
      path.includes("/alerts/remove") ||
      path.includes("/alerts/edit") ||
      path.includes("/alerts/share") ||
      path.includes("/alerts/feedback") ||
      path.includes("/alerts")
    ) {
      return true;
    }
    if (
      (host.includes("facebook.com") && (path.includes("share") || path.includes("sharer"))) ||
      (host.includes("twitter.com") && (path.includes("share") || path.includes("intent"))) ||
      (host === "x.com" && path.includes("intent")) ||
      (host.includes("linkedin.com") && path.includes("share"))
    ) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ico|pdf|xml|rss)(\?|#|$)/i.test(url.pathname);
  } catch {
    return true;
  }
}

function snippetAroundAnchor(html: string, anchorStart: number, anchorEnd: number): string {
  const before = html.slice(Math.max(0, anchorStart - 650), anchorStart);
  const after = html.slice(anchorEnd, Math.min(html.length, anchorEnd + 950));
  return cleanText(`${before} ${after}`).slice(0, 650);
}

function extractGoogleAlertLinks(email: {
  html: string;
  text: string;
  subject: string;
  date: string;
}): ExtractedAlertLink[] {
  const out: ExtractedAlertLink[] = [];
  const seen = new Set<string>();
  const add = (titleText: string, rawUrl: string, snippet = "") => {
    const title = cleanText(titleText, rawUrl);
    if (isUtilityLink(rawUrl, title)) return;
    const unwrapped = cleanArticleUrl(rawUrl);
    if (!isHttpUrl(unwrapped)) return;
    const key = urlKey(unwrapped);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      title: cleanSourceTitle(title, unwrapped),
      publication: sourceFromUrl(unwrapped),
      url: unwrapped,
      originalUrl: rawUrl,
      snippet: truncateText(cleanText(snippet || title), MAX_SOURCE_SNIPPET_CHARS),
      emailSubject: email.subject,
      emailDate: email.date,
    });
  };

  const anchorRe = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(email.html))) {
    const rawUrl = match[1] ?? match[2] ?? "";
    const anchorText = match[3] ?? "";
    add(anchorText, rawUrl, snippetAroundAnchor(email.html, match.index, anchorRe.lastIndex));
  }

  for (const rawUrl of email.text.match(/https?:\/\/[^\s\])"'<>]+/gi) ?? []) {
    add(rawUrl, rawUrl, "");
  }

  return out.slice(0, MAX_LINKS);
}

function londonDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;
}

function lookbackDaysFromHours(hours: number): number {
  return Math.max(1, Math.ceil(hours / 24));
}

function gmailHeader(message: GmailMessage, name: string): string {
  const header = message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function collectPayloadBody(payload: GmailPayload | undefined): { html: string[]; text: string[] } {
  const out = { html: [] as string[], text: [] as string[] };
  const walk = (part: GmailPayload | undefined) => {
    if (!part) return;
    const data = part.body?.data ? decodeBase64Url(part.body.data) : "";
    if (data && part.mimeType === "text/html") out.html.push(data);
    if (data && part.mimeType === "text/plain") out.text.push(data);
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

function topicScore(text: string): number {
  const haystack = text.toLowerCase();
  const keywords = [
    "geo",
    "aeo",
    "ai search",
    "generative engine optimization",
    "generative engine optimisation",
    "answer engine optimization",
    "answer engine optimisation",
    "ai visibility",
    "llm visibility",
    "google ai overviews",
    "chatgpt search",
    "perplexity",
    "gemini",
    "claude",
    "semrush",
    "ahrefs",
    "similarweb",
    "moz",
    "brightedge",
    "conductor",
    "botify",
    "seoclarity",
    "yext",
    "profound",
    "scrunch",
    "peec",
    "otterly",
    "athenahq",
    "lantern",
  ];
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

async function getGmailAccessToken(debug: GeoAiDailyBriefDebug): Promise<string> {
  const configuredUser = process.env.GMAIL_USER?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

  if (configuredUser && configuredUser.toLowerCase() !== EXPECTED_GMAIL_ACCOUNT) {
    debug.configuredGmailUserMatched = false;
    failWithDebug(
      debug,
      `Wrong Gmail account configured. Expected ${EXPECTED_GMAIL_ACCOUNT} but GMAIL_USER is ${configuredUser}. Update GOOGLE_REFRESH_TOKEN / Gmail OAuth credentials in Vercel.`,
    );
  }

  if (!clientId || !clientSecret || !refreshToken) {
    failWithDebug(
      debug,
      "Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN for cambridgecircus@gmail.com.",
    );
  }

  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as GmailTokenResponse;
  if (!res.ok || !body.access_token) {
    failWithDebug(
      debug,
      `Gmail OAuth token refresh failed: ${body.error_description || body.error || `HTTP ${res.status}`}`,
    );
  }

  logDebug(debug, "Gmail OAuth token refresh succeeded");
  return body.access_token;
}

async function gmailApi<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
  }
  if (!res.ok) {
    const err = body && typeof body === "object" && "error" in body ? JSON.stringify(body) : text;
    throw new Error(`Gmail API ${path} failed: HTTP ${res.status} ${err.slice(0, 500)}`);
  }
  return body as T;
}

async function validateGmailAccount(
  accessToken: string,
  debug: GeoAiDailyBriefDebug,
) {
  const profile = await gmailApi<GmailProfile>(accessToken, "/profile");
  const actual = profile.emailAddress || "unknown";
  debug.authenticatedGmailAccount = actual;
  debug.accountMatched = actual.toLowerCase() === EXPECTED_GMAIL_ACCOUNT;
  logDebug(debug, `Gmail API profile emailAddress="${actual}"`);

  if (!debug.accountMatched) {
    failWithDebug(
      debug,
      `Wrong Gmail account connected. Expected ${EXPECTED_GMAIL_ACCOUNT} but authenticated account is ${actual}. Update GOOGLE_REFRESH_TOKEN / Gmail OAuth credentials in Vercel.`,
    );
  }

  logDebug(debug, `Gmail API auth succeeded for ${EXPECTED_GMAIL_ACCOUNT}`);
}

async function listGmailMessages(args: {
  accessToken: string;
  query: string;
  labelId?: string;
}) {
  const params = new URLSearchParams({
    q: args.query,
    maxResults: "20",
    includeSpamTrash: "false",
  });
  if (args.labelId) params.append("labelIds", args.labelId);
  return gmailApi<GmailMessageListResponse>(args.accessToken, `/messages?${params.toString()}`);
}

async function getFullGmailMessage(accessToken: string, id: string) {
  return gmailApi<GmailMessage>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
}

function messageToGoogleAlertEmail(message: GmailMessage): GoogleAlertEmail {
  const body = collectPayloadBody(message.payload);
  const html = body.html.join("\n");
  const text = normalizeWhitespace(body.text.join("\n") || stripHtml(html) || message.snippet || "");
  const internalDate = Number.parseInt(message.internalDate || "", 10) || Date.now();
  const subject = gmailHeader(message, "subject") || "Google Alert";
  const from = gmailHeader(message, "from") || GOOGLE_ALERTS_FROM;
  const dateHeader = gmailHeader(message, "date");
  const date = dateHeader && !Number.isNaN(new Date(dateHeader).getTime())
    ? new Date(dateHeader).toISOString()
    : new Date(internalDate).toISOString();
  const email: GoogleAlertEmail = {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    date,
    internalDate,
    text,
    html,
    links: [],
  };
  email.links = extractGoogleAlertLinks(email);
  return email;
}

async function fetchGoogleAlertEmails(options: {
  lookbackHours: number;
  referenceDate?: Date;
}): Promise<{
  sourceLabel: string;
  accessToken: string;
  messagesFound: number;
  emails: GoogleAlertEmail[];
  debug: GeoAiDailyBriefDebug;
  successfulQuery?: string;
}> {
  const debug = createDebug();
  const sourceLabel = getSourceLabelName();
  const lookbackDays = lookbackDaysFromHours(options.lookbackHours);
  const fallbackDays = Math.max(FALLBACK_SEARCH_WINDOW_DAYS, lookbackDays);
  const query = `from:(${GOOGLE_ALERTS_FROM}) newer_than:${lookbackDays}d`;
  const fallbackQuery = `from:(${GOOGLE_ALERTS_FROM}) newer_than:${fallbackDays}d`;

  const accessToken = await getGmailAccessToken(debug);
  await validateGmailAccount(accessToken, debug);

  const labels = await gmailApi<GmailLabelsResponse>(accessToken, "/labels");
  const careerLabel = (labels.labels ?? []).find((label) => label.name === sourceLabel);
  debug.careerIntelMarketLabelExists = Boolean(careerLabel);
  debug.careerIntelMarketLabelId = careerLabel?.id;
  debug.careerIntelMarketLabelName = careerLabel?.name;
  logDebug(
    debug,
    careerLabel
      ? `CareerIntel/Market label exists id="${careerLabel.id}" name="${careerLabel.name}"`
      : `CareerIntel/Market label not found by exact name "${sourceLabel}"`,
  );

  let primary: GmailMessageListResponse = {};
  if (careerLabel) {
    primary = await listGmailMessages({ accessToken, query, labelId: careerLabel.id });
    debug.labelSearchMessagesFound =
      primary.resultSizeEstimate ?? primary.messages?.length ?? 0;
    logDebug(
      debug,
      `Primary Gmail API search labelIds=["${careerLabel.id}"] q="${query}" found=${debug.labelSearchMessagesFound}`,
    );
  }

  const fallback = await listGmailMessages({ accessToken, query: fallbackQuery });
  debug.fallbackSearchMessagesFound =
    fallback.resultSizeEstimate ?? fallback.messages?.length ?? 0;
  logDebug(debug, `Fallback Gmail API search q="${fallbackQuery}" found=${debug.fallbackSearchMessagesFound}`);

  const primaryIds = new Set((primary.messages ?? []).map((item) => item.id));
  const fallbackIds = new Set((fallback.messages ?? []).map((item) => item.id));
  const orderedIds = new Map<string, GmailMessageListItem>();
  for (const item of primary.messages ?? []) orderedIds.set(item.id, item);
  for (const item of fallback.messages ?? []) orderedIds.set(item.id, item);

  const fullMessages = await Promise.all(
    Array.from(orderedIds.values()).map((item) => getFullGmailMessage(accessToken, item.id)),
  );

  const allEmails = fullMessages.map(messageToGoogleAlertEmail);
  for (const email of allEmails) {
    logDebug(
      debug,
      `Gmail message found subject="${email.subject}" from="${email.from}" date="${email.date}"`,
    );
  }

  const googleAlerts = allEmails
    .filter((email) => email.subject.startsWith("Google Alert -"))
    .sort((a, b) => b.internalDate - a.internalDate);
  logDebug(debug, `Google Alert messages processed=${googleAlerts.length}`);

  const todayKey = londonDateKey(options.referenceDate ?? new Date());
  const todayAlerts = googleAlerts.filter((email) => londonDateKey(new Date(email.date)) === todayKey);
  const candidateAlerts = todayAlerts.length ? todayAlerts : googleAlerts;
  const scored = candidateAlerts
    .map((email) => ({
      email,
      score: topicScore(`${email.subject}\n${email.text}\n${stripHtml(email.html)}`),
    }))
    .sort((a, b) => b.score - a.score || b.email.internalDate - a.email.internalDate);
  const selected = (scored.find((item) => item.score > 0) ?? scored[0])?.email;

  if (!selected) {
    debug.successfulGmailQuery = careerLabel ? `labelIds:[${careerLabel.id}] q:${query}` : `q:${fallbackQuery}`;
    return {
      sourceLabel,
      accessToken,
      messagesFound: debug.labelSearchMessagesFound || debug.fallbackSearchMessagesFound,
      emails: [],
      debug,
      successfulQuery: debug.successfulGmailQuery,
    };
  }

  const selectedFromPrimary = primaryIds.has(selected.id);
  const selectedFromFallback = fallbackIds.has(selected.id);
  debug.successfulGmailQuery =
    careerLabel && selectedFromPrimary
      ? `labelIds:[${careerLabel.id}] q:${query}`
      : selectedFromFallback
        ? `q:${fallbackQuery}`
        : careerLabel
          ? `labelIds:[${careerLabel.id}] q:${query}`
          : `q:${fallbackQuery}`;
  debug.latestGoogleAlertSubject = selected.subject;
  debug.latestGoogleAlertTimestamp = selected.date;
  debug.articleLinksExtracted = selected.links.length;
  logDebug(
    debug,
    `Latest matching Google Alert subject="${selected.subject}" timestamp="${selected.date}" links=${selected.links.length} successfulQuery="${debug.successfulGmailQuery}"`,
  );

  return {
    sourceLabel,
    accessToken,
    messagesFound: careerLabel ? debug.labelSearchMessagesFound : debug.fallbackSearchMessagesFound,
    emails: [selected],
    debug,
    successfulQuery: debug.successfulGmailQuery,
  };
}

function dedupeLinks(emails: GoogleAlertEmail[]): ExtractedAlertLink[] {
  const seen = new Set<string>();
  const out: ExtractedAlertLink[] = [];
  for (const link of emails.flatMap((email) => email.links)) {
    const key = urlKey(link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
    if (out.length >= MAX_LINKS) break;
  }
  console.log(`[GEO_AI_BRIEF] Links extracted=${out.length}`);
  return out;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SWIFT/1.0 GEO x AI Daily Brief",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function failureArticle(
  link: ExtractedAlertLink,
  reason: string,
  debug: GeoAiDailyBriefDebug,
  finalUrl = link.url,
): ArticleInput {
  const cleanFinalUrl = cleanArticleUrl(finalUrl);
  const message = `${cleanFinalUrl}: ${reason}`;
  debug.fetchErrors.push(message);
  console.warn(`[GEO_AI_BRIEF] Article fetch failed url=${cleanFinalUrl} reason=${reason}`);
  return {
    ...link,
    url: cleanFinalUrl,
    finalUrl: cleanFinalUrl,
    publication: sourceFromUrl(cleanFinalUrl),
    content: truncateText(link.snippet, MAX_SOURCE_SNIPPET_CHARS),
    contentFetched: false,
    contentUnavailableReason: reason || "blocked",
  };
}

async function fetchArticle(
  link: ExtractedAlertLink,
  debug: GeoAiDailyBriefDebug,
): Promise<ArticleInput> {
  const initialUrl = cleanArticleUrl(link.url);
  let finalUrl = initialUrl;
  try {
    const host = new URL(initialUrl).hostname.toLowerCase();
    if (host === "news.google.com" || host.endsWith(".news.google.com")) {
      const resolved = await resolveGoogleNewsUrl(initialUrl, link.title);
      finalUrl = resolved.resolvedUrl || initialUrl;
    }
  } catch {
    finalUrl = initialUrl;
  }

  try {
    if (isUtilityLink(finalUrl, link.title)) {
      return failureArticle(link, "blocked utility link", debug, finalUrl);
    }

    const response = await fetchWithTimeout(finalUrl);
    const responseUrl = response.url || finalUrl;
    if (!response.ok) {
      return failureArticle(link, `blocked HTTP ${response.status}`, debug, responseUrl);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType && !contentType.includes("html") && !contentType.includes("text")) {
      return failureArticle(link, `blocked unsupported content type: ${contentType}`, debug, responseUrl);
    }

    const html = await response.text();
    const text = stripHtml(html);
    if (text.length < 260) {
      return failureArticle(link, "blocked or readable content too short", debug, responseUrl);
    }

    debug.articleLinksFetched += 1;
    console.log(`[GEO_AI_BRIEF] Article fetch success url=${responseUrl}`);
    return {
      ...link,
      url: cleanArticleUrl(responseUrl),
      finalUrl: cleanArticleUrl(responseUrl),
      publication: sourceFromUrl(cleanArticleUrl(responseUrl)),
      content: text.slice(0, MAX_ARTICLE_CHARS),
      contentFetched: true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "fetch blocked";
    return failureArticle(link, reason, debug, finalUrl);
  }
}

async function fetchArticles(
  links: ExtractedAlertLink[],
  debug: GeoAiDailyBriefDebug,
): Promise<ArticleInput[]> {
  const out: ArticleInput[] = [];
  for (let i = 0; i < links.length; i += ARTICLE_FETCH_CONCURRENCY) {
    const batch = links.slice(i, i + ARTICLE_FETCH_CONCURRENCY);
    out.push(...(await Promise.all(batch.map((link) => fetchArticle(link, debug)))));
  }
  const fetched = out.filter((article) => article.contentFetched).length;
  console.log(`[GEO_AI_BRIEF] Article fetch complete success=${fetched}; failed=${out.length - fetched}`);
  return out;
}

function buildAnalysisPrompt(args: {
  emails: GoogleAlertEmail[];
  articles: ArticleInput[];
  digestDate: string;
}) {
  const emailText = args.emails
    .map((email, index) =>
      [
        `EMAIL ${index + 1}`,
        `Subject: ${email.subject}`,
        `From: ${email.from}`,
        `Date: ${email.date}`,
        `Body: ${email.text}`,
        `Links: ${email.links.map((link) => `${link.title} (${link.url})`).join("; ")}`,
      ].join("\n"),
    )
    .join("\n\n")
    .slice(0, MAX_EMAIL_PROMPT_CHARS);

  const articleText = args.articles
    .map((article, index) =>
      [
        `SOURCE ${index + 1}`,
        `Title: ${article.title}`,
        `Publication/source: ${article.publication}`,
        `URL: ${article.finalUrl}`,
        `Google Alert snippet: ${article.snippet || "No snippet available."}`,
        `Article content fetched: ${article.contentFetched ? "yes" : "no"}`,
        article.contentFetched
          ? `Article text: ${article.content}`
          : `Article text: content unavailable (${article.contentUnavailableReason || "blocked"}). Analyse from the title/snippet only and mark contentFetched false.`,
      ].join("\n"),
    )
    .join("\n\n")
    .slice(0, MAX_ARTICLE_PROMPT_CHARS);

  return [
    `Digest date: ${args.digestDate}`,
    "You are SWIFT's executive GEO, AI Search, AI visibility, AI Ads, AI discovery, and answer-engine intelligence analyst.",
    "Analyse linked article content first. If a linked article could not be fetched, use only the Google Alert title/snippet for that source and mark contentFetched false.",
    "Use the latest CareerIntel/Market Google Alert as source of truth.",
    "Mention Semrush and Adobe relevance where supported by evidence.",
    "Include GTM/Sales and HRBP implications only where clearly relevant.",
    "Do not add Web3, crypto, employment-law, expansion, downsizing, weekly snapshot, or strong-signal sections.",
    "",
    "GOOGLE ALERT EMAIL",
    emailText || "No email body available.",
    "",
    "LINKED ARTICLE CONTENT AND FALLBACKS",
    articleText || "No links were extracted. Use only the email body and clearly explain the limitation.",
  ].join("\n");
}

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "geo_ai_daily_brief",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "executiveSignal",
        "whatHappenedToday",
        "whyItMattersForSemrushAdobe",
        "gtmSalesImplication",
        "hrbpImplication",
        "recommendedAction",
        "oneLineSummary",
        "sourceLinks",
      ],
      properties: {
        executiveSignal: { type: "string" },
        whatHappenedToday: { type: "string" },
        whyItMattersForSemrushAdobe: { type: "string" },
        gtmSalesImplication: { type: "string" },
        hrbpImplication: { type: "string" },
        recommendedAction: { type: "string" },
        oneLineSummary: { type: "string" },
        sourceLinks: {
          type: "array",
          minItems: 0,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "publication",
              "url",
              "shortSummary",
              "relevanceReason",
              "contentFetched",
            ],
            properties: {
              title: { type: "string" },
              publication: { type: "string" },
              url: { type: "string" },
              shortSummary: { type: "string" },
              relevanceReason: { type: "string" },
              contentFetched: { type: "boolean" },
            },
          },
        },
      },
    },
  },
} as const;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parseJsonish = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return JSON.parse(value.replace(/,\s*([}\]])/g, "$1"));
    }
  };
  try {
    return parseJsonish(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    if (start === -1) throw new Error("AI response did not include a JSON object");
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < trimmed.length; i += 1) {
      const char = trimmed[i];
      if (inString) {
        if (escape) escape = false;
        else if (char === "\\") escape = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return parseJsonish(trimmed.slice(start, i + 1));
      }
    }
    throw new Error("AI response JSON object was incomplete");
  }
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function findValueByKeys(record: Record<string, unknown>, keys: string[]): unknown {
  const wanted = new Set(keys.map(normalizedKey));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizedKey(key))) return value;
  }
  return undefined;
}

function stringFieldAny(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  const value = findValueByKeys(record, keys);
  if (typeof value === "string" && value.trim()) return normalizeWhitespace(value);
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean)
      .join(" ");
    if (joined.trim()) return normalizeWhitespace(joined);
  }
  return fallback;
}

function booleanFieldAny(record: Record<string, unknown>, keys: string[], fallback = false): boolean {
  const value = findValueByKeys(record, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["yes", "true", "fetched", "success", "successful"].includes(lowered)) return true;
    if (["no", "false", "blocked", "unavailable", "failed"].includes(lowered)) return false;
  }
  return fallback;
}

function unwrapBriefRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const nested = findValueByKeys(record, [
    "brief",
    "report",
    "analysis",
    "geoAiDailyBrief",
    "geo_ai_daily_brief",
    "dailyBrief",
  ]);
  return Object.keys(asRecord(nested)).length ? asRecord(nested) : record;
}

function headingToBriefField(heading: string): BriefSectionKey | null {
  const key = normalizedKey(heading);
  if (key.includes("executive") || key.includes("signal")) return "executiveSignal";
  if (key.includes("whathappened") || key.includes("today") || key.includes("marketmovement")) {
    return "whatHappenedToday";
  }
  if (key.includes("semrush") || key.includes("adobe") || key.includes("whyitmatters")) {
    return "whyItMattersForSemrushAdobe";
  }
  if (key.includes("gtm") || key.includes("sales")) return "gtmSalesImplication";
  if (key.includes("hrbp") || key.includes("org") || key.includes("hiring")) return "hrbpImplication";
  if (key.includes("recommended") || key.includes("action") || key.includes("nextstep")) {
    return "recommendedAction";
  }
  if (key.includes("oneline") || key === "summary" || key.includes("tl dr") || key.includes("tldr")) {
    return "oneLineSummary";
  }
  return null;
}

function parseMarkdownBrief(text: string): Record<string, unknown> {
  const fields: Partial<Record<BriefSectionKey, string>> = {};
  let current: BriefSectionKey | null = null;
  const pushLine = (line: string) => {
    if (!current) return;
    const clean = line.trim();
    if (!clean) return;
    fields[current] = [fields[current], clean].filter(Boolean).join(" ");
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch =
      line.match(/^#{1,4}\s+(.+?)\s*$/) ||
      line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/) ||
      line.match(/^([A-Z][A-Za-z /&-]{3,80}):\s*(.*)$/);
    if (headingMatch) {
      const field = headingToBriefField(headingMatch[1]);
      if (field) {
        current = field;
        const inlineValue = headingMatch[2]?.trim();
        if (inlineValue) pushLine(inlineValue);
        continue;
      }
    }
    pushLine(line.replace(/^[-*]\s+/, ""));
  }

  return fields;
}

function buildFallbackPayload(args: {
  emails: GoogleAlertEmail[];
  articles: ArticleInput[];
}): OpenAiBriefPayload {
  const latest = args.emails[0];
  const fetched = args.articles.filter((article) => article.contentFetched).length;
  const sourceLinks = args.articles.slice(0, 12).map((article) => ({
    title: cleanSourceTitle(article.title, article.finalUrl),
    publication: article.publication || sourceFromUrl(article.finalUrl),
    publisher: article.publication || sourceFromUrl(article.finalUrl),
    domain: sourceDomain(article.finalUrl),
    url: cleanArticleUrl(article.finalUrl),
    shortSummary: truncateText(
      article.snippet || "Google Alert source; article content unavailable.",
      MAX_SOURCE_SNIPPET_CHARS,
    ),
    relevanceReason:
      "Included because it appeared in the latest CareerIntel/Market Google Alert for GEO, AI search, or visibility monitoring.",
    contentFetched: article.contentFetched,
    fetchStatus: article.contentFetched ? "fetched" : "content unavailable",
  }));
  const titles = sourceLinks.map((source) => source.title).filter(Boolean).slice(0, 4);
  const titleText = titles.length ? titles.join("; ") : latest?.subject || "CareerIntel/Market Google Alert";
  return {
    executiveSignal:
      `Fallback GEO brief generated from the latest Google Alert because the configured AI provider did not return a usable structured response. Key source themes: ${titleText}.`,
    whatHappenedToday:
      latest
        ? `SWIFT processed "${latest.subject}" from ${new Date(latest.date).toLocaleString()} and extracted ${args.articles.length} source link${args.articles.length === 1 ? "" : "s"}; ${fetched} article${fetched === 1 ? "" : "s"} had readable content.`
        : "SWIFT processed the latest CareerIntel/Market alert context available locally.",
    whyItMattersForSemrushAdobe:
      "These signals are relevant to Semrush and Adobe where they indicate shifts in AI search visibility, answer-engine discovery, content measurement, or paid AI/search surfaces.",
    gtmSalesImplication:
      "Use the source list to identify customer-facing hooks around AI visibility, GEO measurement, answer-engine optimization, and search workflow change.",
    hrbpImplication:
      "Treat this as a capability signal for marketing, SEO, content, analytics, and revenue teams; hiring or upskilling implications depend on repeated evidence across alerts.",
    recommendedAction:
      "Review the fetched source links, confirm which signals are strongest, and convert the highest-confidence GEO or AI search movement into one customer-ready point of view.",
    oneLineSummary:
      `Latest CareerIntel/Market alert produced ${args.articles.length} GEO / AI search source link${args.articles.length === 1 ? "" : "s"} for review.`,
    sourceLinks,
  };
}

async function runAiAnalysis(args: {
  emails: GoogleAlertEmail[];
  articles: ArticleInput[];
  digestDate: string;
  debug: GeoAiDailyBriefDebug;
}): Promise<OpenAiBriefPayload> {
  const config = getAiConfig();
  args.debug.aiProviderUsed = config.provider;
  args.debug.aiModelUsed = config.model;
  logDebug(args.debug, `AI provider selected provider=${config.provider} model=${config.model}`);

  if (!config.apiKey) {
    throw new Error(
      config.provider === "deepseek"
        ? "DEEPSEEK_API_KEY is not configured"
        : "OPENAI_API_KEY is not configured",
    );
  }

  const responseBody: Record<string, unknown> = {
    model: config.model,
    temperature: 0.2,
    max_tokens: 2200,
    response_format: config.provider === "openai" ? responseFormat : { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return only JSON that matches the requested schema. Be concise, evidence-led, and executive-ready.",
      },
      {
        role: "user",
        content: buildAnalysisPrompt(args),
      },
    ],
  };

  const response = await fetch(getAiChatCompletionsUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(responseBody),
  });

  const rawText = await response.text();
  if (!response.ok) {
    console.error(`[GEO_AI_BRIEF] AI failed provider=${config.provider}`, rawText.slice(0, 900));
    throw new Error(`${config.provider} analysis failed: HTTP ${response.status}`);
  }

  const parsed = JSON.parse(rawText) as AiChatResponse;
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(parsed.error?.message || "AI response did not include JSON content");
  }

  logDebug(args.debug, `AI analysis succeeded provider=${config.provider} model=${config.model}`);
  let structured: unknown;
  try {
    structured = extractJsonObject(content);
  } catch {
    logDebug(args.debug, "AI response was not valid JSON; parsing markdown headings");
    structured = parseMarkdownBrief(content);
  }
  return coerceOpenAiPayload(structured, args.articles);
}

function coerceOpenAiPayload(value: unknown, articles: ArticleInput[]): OpenAiBriefPayload {
  const record = unwrapBriefRecord(value);
  const sourceByKey = new Map<string, ArticleInput>();
  for (const article of articles) {
    sourceByKey.set(urlKey(article.finalUrl), article);
    sourceByKey.set(urlKey(article.url), article);
  }

  const rawSources = findValueByKeys(record, [
    "sourceLinks",
    "source_links",
    "sources",
    "sourceItems",
    "articles",
    "links",
  ]);
  const sourceLinks = Array.isArray(rawSources)
    ? rawSources
        .map<GeoAiBriefSource | null>((item) => {
          if (!item || typeof item !== "object") return null;
          const source = item as Record<string, unknown>;
          const rawUrl = cleanArticleUrl(
            stringFieldAny(source, ["url", "link", "href", "sourceUrl", "source_url"]),
          );
          if (!rawUrl || !isHttpUrl(rawUrl)) return null;
          const matched = sourceByKey.get(urlKey(rawUrl));
          const url = cleanArticleUrl(matched?.finalUrl || rawUrl);
          const publication = stringFieldAny(
            source,
            ["publication", "publisher", "source", "domain", "site"],
            matched?.publication || sourceFromUrl(url),
          ).slice(0, 120);
          const contentFetched = matched?.contentFetched ?? booleanFieldAny(source, [
            "contentFetched",
            "content_fetched",
            "fetched",
            "articleFetched",
          ]);
          return {
            title: cleanSourceTitle(
              stringFieldAny(source, ["title", "subject", "headline", "name"], matched?.title || sourceFromUrl(url)),
              url,
            ),
            publication,
            publisher: publication,
            domain: sourceDomain(url),
            url,
            shortSummary: truncateText(
              sanitizeBriefText(
                stringFieldAny(source, ["shortSummary", "short_summary", "summary", "snippet"], matched?.snippet || ""),
                MAX_SOURCE_SNIPPET_CHARS,
              ),
              MAX_SOURCE_SNIPPET_CHARS,
            ),
            relevanceReason: truncateText(
              sanitizeBriefText(
                stringFieldAny(
                  source,
                  ["relevanceReason", "relevance_reason", "relevance", "reason"],
                  "Relevant to GEO x AI visibility.",
                ),
                MAX_SOURCE_SNIPPET_CHARS,
              ),
              MAX_SOURCE_SNIPPET_CHARS,
            ),
            contentFetched,
            fetchStatus: contentFetched ? "fetched" : "content unavailable",
          };
        })
        .filter((item): item is GeoAiBriefSource => Boolean(item))
        .slice(0, 12)
    : [];

  if (!sourceLinks.length) {
    sourceLinks.push(
      ...articles.slice(0, 12).map((article) => ({
        title: cleanSourceTitle(article.title, article.finalUrl),
        publication: article.publication,
        publisher: article.publication,
        domain: sourceDomain(article.finalUrl),
        url: cleanArticleUrl(article.finalUrl),
        shortSummary: truncateText(article.snippet || "Google Alert source.", MAX_SOURCE_SNIPPET_CHARS),
        relevanceReason: "Used as evidence for the GEO x AI Daily Brief.",
        contentFetched: article.contentFetched,
        fetchStatus: article.contentFetched ? "fetched" : "content unavailable",
      })),
    );
  }

  return {
    executiveSignal: sanitizeBriefText(
      stringFieldAny(record, ["executiveSignal", "executive_signal", "executiveSummary", "executive_summary"]),
      MAX_EXECUTIVE_SIGNAL_CHARS,
    ),
    whatHappenedToday: sanitizeBriefText(
      stringFieldAny(record, ["whatHappenedToday", "what_happened_today", "whatHappened", "marketMovement"]),
    ),
    whyItMattersForSemrushAdobe: sanitizeBriefText(
      stringFieldAny(record, [
        "whyItMattersForSemrushAdobe",
        "why_it_matters_for_semrush_adobe",
        "whyItMatters",
        "semrushAdobeRelevance",
        "semrush_adobe_relevance",
      ]),
    ),
    gtmSalesImplication: sanitizeBriefText(
      stringFieldAny(record, [
        "gtmSalesImplication",
        "gtm_sales_implication",
        "salesImplication",
        "sales_implication",
        "gtmImplication",
        "gtm_implication",
        "geoAiSearchAdsImplications",
      ]),
    ),
    hrbpImplication: sanitizeBriefText(
      stringFieldAny(record, [
        "hrbpImplication",
        "hrbp_implication",
        "hrbpImplications",
        "hrbp_implications",
        "hrbpOrgHiringRelevance",
      ]),
    ),
    recommendedAction: sanitizeBriefText(
      stringFieldAny(record, [
        "recommendedAction",
        "recommended_action",
        "recommendedActions",
        "recommended_actions",
        "nextSteps",
        "next_steps",
      ]),
    ),
    oneLineSummary: sanitizeBriefText(
      stringFieldAny(record, ["oneLineSummary", "one_line_summary", "summary", "tlDr", "tldr"]),
      320,
    ),
    sourceLinks,
  };
}

function compactSources(sourceLinks: GeoAiBriefSource[]): GeoAiBriefCompactSource[] {
  const seen = new Set<string>();
  const out: GeoAiBriefCompactSource[] = [];
  for (const source of sourceLinks) {
    const url = cleanArticleUrl(source.url);
    if (!isHttpUrl(url) || isUtilityLink(url, source.title)) continue;
    const key = urlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const domain = source.domain || sourceDomain(url);
    const publisher = source.publisher || source.publication || domain;
    out.push({
      title: cleanSourceTitle(source.title, url),
      publisher: truncateText(cleanText(publisher || domain), 120),
      domain,
      url,
      fetchStatus: source.fetchStatus || (source.contentFetched ? "fetched" : "content unavailable"),
      snippet: source.shortSummary
        ? truncateText(sanitizeBriefText(source.shortSummary, MAX_SOURCE_SNIPPET_CHARS), MAX_SOURCE_SNIPPET_CHARS)
        : undefined,
    });
    if (out.length >= MAX_DISPLAY_SOURCES) break;
  }
  return out;
}

function sourceReferenceText(sources: GeoAiBriefCompactSource[]): string {
  const refs = sources
    .slice(0, 3)
    .map((source) => `${source.title} (${source.publisher || source.domain})`)
    .filter(Boolean);
  return refs.length ? refs.join("; ") : "the latest CareerIntel/Market Google Alert sources";
}

function deterministicFallbackSections(brief: GeoAiDailyBrief): Record<BriefSectionKey, string> {
  const sources = brief.sources?.length ? brief.sources : compactSources(brief.sourceLinks);
  const sourceRefs = sourceReferenceText(sources);
  const alertSubject = brief.gmailDebug.latestGoogleAlertSubject || "today's CareerIntel/Market Google Alert";
  return {
    executiveSignal:
      "Today's CareerIntel/Market Google Alert shows continued market activity around GEO, AEO, AI search visibility, and brand discoverability. The signal is that AI visibility is becoming a mainstream marketing and GTM category rather than a niche SEO topic.",
    whatHappenedToday:
      `Several sources in ${alertSubject} referenced GEO, AI search visibility, brand visibility, and related vendor/activity signals. Top referenced sources include: ${sourceRefs}.`,
    whyItMattersForSemrushAdobe:
      "This matters for Semrush and Adobe because the market is moving from classic SEO measurement toward AI visibility, answer-engine visibility, and brand discoverability across AI search experiences. Semrush has an opportunity to position this as a commercial GTM capability, not just a product feature.",
    gtmSalesImplication:
      "Sales teams need a clearer narrative for selling AI visibility: how brands are found, cited, and recommended across AI search and answer engines. This requires stronger PMM messaging, enablement, competitive talk tracks, and proof points linked to pipeline and category visibility.",
    hrbpImplication:
      "For HRBP work, the implication is capability building: sales enablement, manager coaching, critical talent retention, and identifying where GEO/AEO knowledge is needed across Sales, Marketing, Product, and Customer-facing teams.",
    recommendedAction:
      "Review current GTM capability against the AI visibility narrative. Identify the roles and teams that need enablement first, align PMM/Sales messaging, and prepare a short stakeholder update on how GEO affects Semrush/Adobe GTM priorities.",
    oneLineSummary:
      "GEO and AI visibility are becoming a mainstream GTM category, and Semrush should treat this as a sales capability and positioning shift.",
  };
}

function normalizeBrief(brief: GeoAiDailyBrief): GeoAiDailyBrief {
  const fallbacks = deterministicFallbackSections(brief);
  const next = { ...brief };
  for (const key of REQUIRED_BRIEF_FIELDS) {
    const maxLength = key === "executiveSignal" ? MAX_EXECUTIVE_SIGNAL_CHARS : key === "oneLineSummary" ? 320 : MAX_SECTION_CHARS;
    const current = sanitizeBriefText(next[key], maxLength);
    next[key] = current || sanitizeBriefText(fallbacks[key], maxLength);
  }

  next.headline = next.oneLineSummary || next.executiveSignal;
  next.executiveSummary = sanitizeBriefText(
    [
      next.executiveSignal,
      next.whatHappenedToday,
      next.whyItMattersForSemrushAdobe,
      next.recommendedAction,
    ].join(" "),
    MAX_SECTION_CHARS,
  );
  next.topSignals = [next.executiveSignal, next.oneLineSummary, next.recommendedAction]
    .filter(Boolean)
    .map((item) => sanitizeBriefText(item, 320))
    .slice(0, 3);
  next.marketMovement = next.whatHappenedToday;
  next.geoAiSearchAdsImplications = next.gtmSalesImplication;
  next.semrushAdobeRelevance = next.whyItMattersForSemrushAdobe;
  next.hrbpOrgHiringRelevance = next.hrbpImplication;
  next.sources = next.sources?.length ? next.sources.slice(0, MAX_DISPLAY_SOURCES) : compactSources(next.sourceLinks);
  next.sourceLinks = next.sourceLinks.slice(0, MAX_DISPLAY_SOURCES);

  const completeness = Object.fromEntries(
    REQUIRED_BRIEF_FIELDS.map((key) => [key, Boolean(next[key]?.trim())]),
  );
  console.log("[GEO_AI_BRIEF] Section completeness", JSON.stringify(completeness));

  const missing = REQUIRED_BRIEF_FIELDS.filter((key) => !next[key]?.trim());
  if (missing.length) {
    throw new Error(`GEO x AI Daily Brief normalization failed; empty sections remain: ${missing.join(", ")}`);
  }

  return next;
}

function buildDebugSummary(args: {
  trigger: BriefTrigger;
  debug: GeoAiDailyBriefDebug;
  diagnostics: GeoAiDailyBrief["diagnostics"];
  emailSent: boolean;
}): GeoAiBriefDebugSummary {
  return {
    triggerType: args.trigger,
    gmailAccount: args.debug.authenticatedGmailAccount || "unknown",
    labelFound: args.debug.careerIntelMarketLabelExists,
    latestGoogleAlertSubject: args.debug.latestGoogleAlertSubject,
    latestGoogleAlertTimestamp: args.debug.latestGoogleAlertTimestamp,
    articleLinksExtracted: args.debug.articleLinksExtracted,
    articleLinksFetched: args.debug.articleLinksFetched,
    aiProvider: args.diagnostics.aiProvider,
    model: args.diagnostics.aiModel,
    fallbackUsed: args.diagnostics.fallbackBriefUsed,
    emailSent: args.emailSent,
  };
}

function buildWarnings(articles: ArticleInput[]): string[] {
  const warnings: string[] = [];
  const failures = articles.filter((article) => !article.contentFetched);
  if (articles.length && failures.length === articles.length) {
    warnings.push("Article content could not be fetched; this brief uses Google Alert titles and snippets.");
  } else if (failures.length) {
    warnings.push(
      `${failures.length} source${failures.length === 1 ? "" : "s"} could not be fetched and were analysed from Google Alert snippets.`,
    );
  }
  return warnings;
}

function buildBrief(args: {
  payload: OpenAiBriefPayload;
  articles: ArticleInput[];
  generatedAt: string;
  digestDate: string;
  trigger: BriefTrigger;
  diagnostics: GeoAiDailyBrief["diagnostics"];
  debug: GeoAiDailyBriefDebug;
}): GeoAiDailyBrief {
  const emailSubject = `SWIFT GEO x AI Daily Brief — ${args.digestDate}`;
  const compactSourceList = compactSources(args.payload.sourceLinks);
  const executiveSummary = [
    args.payload.executiveSignal,
    args.payload.whatHappenedToday,
    args.payload.whyItMattersForSemrushAdobe,
    args.payload.recommendedAction,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    reportType: "geo_ai_daily_brief",
    title: "GEO x AI Daily Brief",
    generatedAt: args.generatedAt,
    lastUpdatedAt: args.generatedAt,
    digestDate: args.digestDate,
    trigger: args.trigger,
    headline: args.payload.oneLineSummary || args.payload.executiveSignal,
    executiveSignal: sanitizeBriefText(args.payload.executiveSignal, MAX_EXECUTIVE_SIGNAL_CHARS),
    whatHappenedToday: sanitizeBriefText(args.payload.whatHappenedToday),
    whyItMattersForSemrushAdobe: sanitizeBriefText(args.payload.whyItMattersForSemrushAdobe),
    gtmSalesImplication: sanitizeBriefText(args.payload.gtmSalesImplication),
    hrbpImplication: sanitizeBriefText(args.payload.hrbpImplication),
    recommendedAction: sanitizeBriefText(args.payload.recommendedAction),
    oneLineSummary: sanitizeBriefText(args.payload.oneLineSummary, 320),
    executiveSummary: sanitizeBriefText(executiveSummary, MAX_SECTION_CHARS),
    topSignals: [
      args.payload.executiveSignal,
      args.payload.oneLineSummary,
      args.payload.recommendedAction,
    ].filter(Boolean).map((item) => sanitizeBriefText(item, 320)).slice(0, 3),
    marketMovement: sanitizeBriefText(args.payload.whatHappenedToday),
    geoAiSearchAdsImplications: sanitizeBriefText(args.payload.gtmSalesImplication),
    semrushAdobeRelevance: sanitizeBriefText(args.payload.whyItMattersForSemrushAdobe),
    hrbpOrgHiringRelevance: sanitizeBriefText(args.payload.hrbpImplication),
    sources: compactSourceList,
    sourceLinks: args.payload.sourceLinks.slice(0, MAX_DISPLAY_SOURCES),
    warnings: buildWarnings(args.articles),
    email: {
      to: getDigestRecipient(),
      subject: emailSubject,
      sent: false,
      labelApplied: false,
    },
    gmailDebug: args.debug,
    debug: buildDebugSummary({
      trigger: args.trigger,
      debug: args.debug,
      diagnostics: args.diagnostics,
      emailSent: false,
    }),
    diagnostics: args.diagnostics,
  };
}

function buildEmailHtml(brief: GeoAiDailyBrief): string {
  const sourceItems = (brief.sources?.length ? brief.sources : compactSources(brief.sourceLinks))
    .map(
      (source) => `
        <li style="margin:0 0 14px;">
          <div style="color:#f8fafc;font-weight:700;">${escapeHtml(source.title)}</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:3px;">Source: ${escapeHtml(source.publisher || source.domain)} · ${escapeHtml(source.fetchStatus)}</div>
          <a href="${escapeHtml(source.url)}" style="display:inline-block;margin-top:6px;color:#93c5fd;text-decoration:none;font-weight:700;">View original article</a>
        </li>
      `,
    )
    .join("");
  const warnings = brief.warnings
    .map((warning) => `<p style="margin:8px 0;color:#fde68a;">${escapeHtml(warning)}</p>`)
    .join("");
  const debugFooter = [
    `Trigger: ${brief.trigger}`,
    `Gmail account: ${brief.gmailDebug.authenticatedGmailAccount || "unknown"}`,
    `AI provider: ${brief.diagnostics.aiProvider}`,
    `Model: ${brief.diagnostics.aiModel}`,
    `Fallback used: ${brief.diagnostics.fallbackBriefUsed ? "yes" : "no"}`,
  ].join(" · ");

  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Inter,Arial,sans-serif;">
        <div style="max-width:760px;margin:0 auto;padding:28px 22px;">
          <p style="margin:0 0 8px;color:#38bdf8;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">SWIFT</p>
          <h1 style="margin:0 0 8px;color:#f8fafc;font-size:28px;line-height:1.2;">GEO x AI Daily Brief</h1>
          <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;">Generated ${escapeHtml(new Date(brief.generatedAt).toLocaleString())}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">Executive Signal</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.executiveSignal)}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">What Happened Today</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.whatHappenedToday)}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">Why It Matters for Semrush / Adobe</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.whyItMattersForSemrushAdobe)}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">GTM / Sales Implication</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.gtmSalesImplication)}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">HRBP Implication</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.hrbpImplication)}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">Recommended Action</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.recommendedAction)}</p>

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">One-line Summary</h2>
          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(brief.oneLineSummary)}</p>

          ${warnings ? `<div style="margin:24px 0;padding:12px 14px;border:1px solid rgba(251,191,36,.32);background:rgba(120,53,15,.24);border-radius:8px;">${warnings}</div>` : ""}

          <h2 style="margin:26px 0 10px;color:#f8fafc;font-size:18px;">Source Links</h2>
          <ul style="margin:0;padding-left:20px;color:#cbd5e1;font-size:15px;line-height:1.6;">${sourceItems}</ul>

          <hr style="border:none;border-top:1px solid rgba(148,163,184,.25);margin:28px 0 14px;" />
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${escapeHtml(debugFooter)}</p>
        </div>
      </body>
    </html>
  `;
}

function buildEmailText(brief: GeoAiDailyBrief): string {
  const sources = brief.sources?.length ? brief.sources : compactSources(brief.sourceLinks);
  return [
    "GEO x AI Daily Brief",
    `Generated ${new Date(brief.generatedAt).toLocaleString()}`,
    "",
    "Executive Signal",
    brief.executiveSignal,
    "",
    "What Happened Today",
    brief.whatHappenedToday,
    "",
    "Why It Matters for Semrush / Adobe",
    brief.whyItMattersForSemrushAdobe,
    "",
    "GTM / Sales Implication",
    brief.gtmSalesImplication,
    "",
    "HRBP Implication",
    brief.hrbpImplication,
    "",
    "Recommended Action",
    brief.recommendedAction,
    "",
    "One-line Summary",
    brief.oneLineSummary,
    "",
    "Source Links",
    ...sources.map(
      (source) =>
        `- ${source.title}\n  Source: ${source.publisher || source.domain}\n  Link: ${source.url}\n  Status: ${source.fetchStatus}`,
    ),
    "",
    `Debug: trigger=${brief.trigger}; gmail=${brief.gmailDebug.authenticatedGmailAccount || "unknown"}; aiProvider=${brief.diagnostics.aiProvider}; model=${brief.diagnostics.aiModel}; fallbackUsed=${brief.diagnostics.fallbackBriefUsed ? "yes" : "no"}`,
  ].join("\n");
}

function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function makeBoundary() {
  return `swift-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildRawEmail(brief: GeoAiDailyBrief): string {
  const boundary = makeBoundary();
  const from = process.env.GMAIL_USER?.trim() || getDigestRecipient();
  const html = buildEmailHtml(brief);
  const text = buildEmailText(brief);
  return [
    `From: SWIFT <${from}>`,
    `To: ${brief.email.to}`,
    `Subject: ${encodeHeader(brief.email.subject)}`,
    `Date: ${new Date(brief.generatedAt).toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function findGmailLabelByName(accessToken: string, labelName: string): Promise<GmailLabel | null> {
  const labels = await gmailApi<GmailLabelsResponse>(accessToken, "/labels");
  return (labels.labels ?? []).find((label) => label.name === labelName) ?? null;
}

async function getOrCreateGmailLabel(args: {
  accessToken: string;
  labelName: string;
  debug: GeoAiDailyBriefDebug;
  create: boolean;
}): Promise<GmailLabel | null> {
  const existing = await findGmailLabelByName(args.accessToken, args.labelName);
  if (existing) return existing;
  if (!args.create) return null;

  const created = await gmailApi<GmailLabel>(args.accessToken, "/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: args.labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  logDebug(args.debug, `Gmail label created name="${args.labelName}" id="${created.id}"`);
  return created;
}

async function sendAndLabelDigestEmail(
  brief: GeoAiDailyBrief,
  accessToken: string,
  debug: GeoAiDailyBriefDebug,
): Promise<GeoAiDailyBrief["email"]> {
  const rawEmail = buildRawEmail(brief);
  const email = { ...brief.email };

  try {
    const sent = await gmailApi<GmailSendMessageResponse>(accessToken, "/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encodeBase64Url(rawEmail) }),
    });
    if (!sent.id) throw new Error("Gmail API did not return a sent message id");
    email.messageId = sent.id;
    email.sent = true;
    logDebug(debug, `Email sent through Gmail API messageId="${sent.id}" to="${brief.email.to}"`);
  } catch (error) {
    email.error = error instanceof Error ? error.message : "Email send failed";
    console.error("[GEO_AI_BRIEF] Email send failed", error);
    return email;
  }

  try {
    const label = await getOrCreateGmailLabel({
      accessToken,
      labelName: getDigestLabelName(),
      debug,
      create: true,
    });
    if (!label?.id || !email.messageId) {
      throw new Error("Gmail digest label could not be resolved");
    }
    await gmailApi<Record<string, unknown>>(
      accessToken,
      `/messages/${encodeURIComponent(email.messageId)}/modify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addLabelIds: [label.id] }),
      },
    );
    email.labelApplied = true;
    logDebug(
      debug,
      `Gmail label applied label="${label.name}" id="${label.id}" messageId="${email.messageId}"`,
    );
  } catch (error) {
    email.error = error instanceof Error ? error.message : "Gmail label apply failed";
    console.error("[GEO_AI_BRIEF] Gmail label apply failed", error);
  }

  return email;
}

async function findStoredScheduledBriefForDate(
  digestDate: string,
): Promise<GeoAiDailyBrief | null> {
  const latest = await getLatestRuns(50);
  const row = latest.runs.find((run) => {
    const report = run.report_json;
    if (!report || typeof report !== "object") return false;
    const brief = report as Partial<GeoAiDailyBrief>;
    return (
      brief.reportType === "geo_ai_daily_brief" &&
      brief.digestDate === digestDate &&
      brief.trigger === "scheduled" &&
      brief.email?.sent === true
    );
  });
  return row ? normalizeBrief(row.report_json as GeoAiDailyBrief) : null;
}

async function hasDigestEmailForDate(
  digestDate: string,
  accessToken: string,
  debug: GeoAiDailyBriefDebug,
): Promise<boolean> {
  const digestLabel = getDigestLabelName();
  try {
    const label = await getOrCreateGmailLabel({
      accessToken,
      labelName: digestLabel,
      debug,
      create: false,
    });
    if (!label?.id) {
      logDebug(debug, `Digest duplicate check skipped; label "${digestLabel}" does not exist yet`);
      return false;
    }
    const expectedSubject = `SWIFT GEO x AI Daily Brief — ${digestDate}`;
    const query = `subject:"${expectedSubject}" newer_than:7d`;
    const messages = await listGmailMessages({
      accessToken,
      labelId: label.id,
      query,
    });
    const found = messages.resultSizeEstimate ?? messages.messages?.length ?? 0;
    logDebug(
      debug,
      `Digest duplicate Gmail API check labelIds=["${label.id}"] q="${query}" found=${found}`,
    );
    return found > 0;
  } catch (error) {
    console.warn("[GEO_AI_BRIEF] Digest duplicate Gmail API check skipped", error);
    return false;
  }
}

export async function getLatestGeoAiDailyBrief(): Promise<{
  brief: GeoAiDailyBrief | null;
  storageConfigured: boolean;
  error?: string;
}> {
  const latest = await getLatestRuns(30);
  const row = latest.runs.find((run) => {
    const report = run.report_json;
    return Boolean(
      report &&
        typeof report === "object" &&
        (report as Record<string, unknown>).reportType === "geo_ai_daily_brief",
    );
  });
  if (!row) return { brief: null, storageConfigured: !latest.error, error: latest.error };
  const report = row.report_json as GeoAiDailyBrief;
  return { brief: normalizeBrief(report), storageConfigured: true };
}

export async function generateGeoAiDailyBrief(
  options: GenerateGeoAiDailyBriefOptions = {},
): Promise<GenerateGeoAiDailyBriefResult> {
  const trigger = options.trigger ?? "manual";
  const lookbackHours = options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const shouldSendEmail = options.sendEmail ?? true;
  const forceSendEmail = options.forceSendEmail ?? trigger === "manual";
  const generatedAt = new Date().toISOString();
  const digestDate = londonDateKey(new Date(generatedAt));
  const sourceLabel = getSourceLabelName();
  const digestLabel = getDigestLabelName();
  console.log(`[GEO_AI_BRIEF] Run started trigger=${trigger} sendEmail=${shouldSendEmail}`);

  if (trigger === "scheduled" && !forceSendEmail) {
    const storedDuplicate = await findStoredScheduledBriefForDate(digestDate);
    if (storedDuplicate) {
      const normalizedDuplicate = normalizeBrief(storedDuplicate);
      normalizedDuplicate.diagnostics.duplicateScheduledEmailSkipped = true;
      console.log(`[GEO_AI_BRIEF] Scheduled duplicate skipped from storage date=${digestDate}`);
      return {
        brief: normalizedDuplicate,
        storage: { saved: true },
        duplicateSkipped: true,
        message: `Scheduled GEO x AI brief email already exists for ${digestDate}`,
        debug: normalizedDuplicate.gmailDebug,
      };
    }
  }

  const {
    accessToken,
    messagesFound,
    emails,
    debug,
    successfulQuery,
  } = await fetchGoogleAlertEmails({
    lookbackHours,
    referenceDate: new Date(generatedAt),
  });

  if (trigger === "scheduled" && !forceSendEmail) {
    const labelledDuplicate = await hasDigestEmailForDate(digestDate, accessToken, debug);
    if (labelledDuplicate) {
      console.log(`[GEO_AI_BRIEF] Scheduled duplicate skipped from Gmail label date=${digestDate}`);
      return {
        brief: null,
        storage: { saved: false, error: "Duplicate scheduled digest already labelled in Gmail" },
        duplicateSkipped: true,
        message: `Scheduled GEO x AI brief email already exists for ${digestDate}`,
        debug,
      };
    }
  }

  if (!emails.length) {
    const message = `No Google Alert found in CareerIntel/Market. Gmail API label search found ${debug.labelSearchMessagesFound}; fallback found ${debug.fallbackSearchMessagesFound}.`;
    debug.error = message;
    console.warn(`[GEO_AI_BRIEF] ${message}`);
    return {
      brief: null,
      empty: true,
      storage: { saved: false, error: message },
      message,
      debug,
    };
  }

  const links = dedupeLinks(emails);
  debug.articleLinksExtracted = links.length;
  const articles = await fetchArticles(links, debug);
  const fetchedCount = articles.filter((article) => article.contentFetched).length;
  debug.articleLinksFetched = fetchedCount;
  const aiConfig = getAiConfig();
  debug.aiProviderUsed = aiConfig.provider;
  debug.aiModelUsed = aiConfig.model;

  const diagnostics: GeoAiDailyBrief["diagnostics"] = {
    sourceLabel,
    digestLabel,
    lookbackHours,
    gmailMessagesFound: messagesFound,
    googleAlertMessagesProcessed: emails.length,
    linksExtracted: links.length,
    articlesFetched: fetchedCount,
    articleFetchFailures: Math.max(0, articles.length - fetchedCount),
    aiProvider: aiConfig.provider,
    aiModel: aiConfig.model,
    fallbackBriefUsed: false,
  };

  let payload: OpenAiBriefPayload;
  try {
    payload = await runAiAnalysis({ emails, articles, digestDate, debug });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI analysis failed";
    diagnostics.fallbackBriefUsed = true;
    debug.fallbackBriefUsed = true;
    debug.error = reason;
    console.error("[GEO_AI_BRIEF] AI analysis failed; using fallback brief", error);
    payload = buildFallbackPayload({ emails, articles });
  }

  const brief = normalizeBrief(
    buildBrief({
      payload,
      articles,
      generatedAt,
      digestDate,
      trigger,
      diagnostics,
      debug,
    }),
  );
  if (diagnostics.fallbackBriefUsed) {
    brief.warnings.push("Configured AI provider failed; this brief was generated from Google Alert titles, snippets, and fetched article text.");
  }

  if (shouldSendEmail) {
    brief.email = await sendAndLabelDigestEmail(brief, accessToken, debug);
    brief.debug.emailSent = brief.email.sent;
  }

  const storage = await saveIntelligenceRun({
    runType: trigger,
    report: brief as unknown as Record<string, unknown>,
    rawSignalCount: links.length,
    cleanSignalCount: fetchedCount,
    emailStatus: brief.email.sent ? "sent" : brief.email.error ? "error" : "skipped",
    emailMessageId: brief.email.messageId,
    marketSignals: brief.sourceLinks.map((source) => ({
      title: source.title,
      url: source.url,
      sourceName: source.publication,
      category: "geo_ai_daily_brief",
      publishedAt: generatedAt,
      summary: source.shortSummary,
      whyItMatters: source.relevanceReason,
      hrbpImplication: brief.hrbpImplication,
    })),
  });

  brief.diagnostics.storageSaved = storage.saved;
  if (storage.error) brief.diagnostics.storageError = storage.error;

  console.log(
    `[GEO_AI_BRIEF] Run complete trigger=${trigger}; successfulGmailQuery=${JSON.stringify(
      successfulQuery,
    )}; gmailAccount=${debug.authenticatedGmailAccount || "unknown"}; labelFound=${debug.careerIntelMarketLabelExists}; latestSubject=${JSON.stringify(
      debug.latestGoogleAlertSubject,
    )}; latestTimestamp=${debug.latestGoogleAlertTimestamp || "unknown"}; linksExtracted=${
      debug.articleLinksExtracted
    }; linksFetched=${debug.articleLinksFetched}; aiProvider=${diagnostics.aiProvider}; model=${
      diagnostics.aiModel
    }; fallbackUsed=${diagnostics.fallbackBriefUsed}; emailSent=${brief.email.sent}; labelApplied=${
      brief.email.labelApplied
    }; storageSaved=${storage.saved}`,
  );

  return {
    brief,
    storage,
    debug,
  };
}
