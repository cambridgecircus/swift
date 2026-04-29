import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { runGuardedFetch } from "@/lib/imapFetchGuard";

export type DailyMarketIntelSection =
  | "ai_market"
  | "web3_market"
  | "hrbp_leadership"
  | "employment_law"
  | "expansion_downsizing";

export type DailyMarketIntelItem = {
  title: string;
  url: string;
  source: string;
  rawSection?: string;
  /** Optional: which query/profile surfaced this item (when available). */
  query?: string;
  /** Best-effort; if unknown, may fall back to the email date upstream. */
  publishedAt?: string;
  /**
   * Best-effort snippet (often derived from RSS description / adjacent email text).
   * Keep even if short/duplicative; downstream can decide whether it is meaningful.
   */
  rssSnippet?: string;
};

export type DailyMarketIntelEmail = {
  subject: string;
  from: string;
  date: string;
  sections: Record<DailyMarketIntelSection, DailyMarketIntelItem[]>;
};

export type DailyMarketIntelResult = {
  generatedAt: string;
  emails: DailyMarketIntelEmail[];
};

function emptySections(): Record<DailyMarketIntelSection, DailyMarketIntelItem[]> {
  return {
    ai_market: [],
    web3_market: [],
    hrbp_leadership: [],
    employment_law: [],
    expansion_downsizing: [],
  };
}

function decodeEmailText(input: string): string {
  return input
    // quoted-printable soft breaks
    .replace(/=\r?\n/g, "")
    // common escapes we see in Gmail/Apps Script content
    .replaceAll("=3D", "=")
    .replaceAll("=3d", "=")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string): string {
  // Trim trailing punctuation that often sticks to URLs in emails.
  return url.trim().replace(/[)\]>"'<.,;:!?]+$/g, "");
}

function isUselessUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return true;
  if (u.startsWith("mailto:")) return true;
  if (u.includes("unsubscribe")) return true;
  if (u.includes("email-settings") || u.includes("psettings") || u.includes("/settings")) return true;
  if (u.includes("privacy") || u.includes("legal") || u.includes("/help")) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(u)) return true;
  if (/\.(css|js|woff2?|ttf|eot)(\?|#|$)/i.test(u)) return true;
  if (u.includes("logo")) return true;
  return false;
}

function sourceFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return host || "source";
  } catch {
    return "source";
  }
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

function inferSectionFromTitle(title: string, url: string): DailyMarketIntelSection | null {
  const blob = `${title} ${url}`.toLowerCase();
  if (/\bemployment law\b|\blabou?r law\b|\btribunal\b|\bredundan(cy|cies)\b|\bworks council\b/.test(blob)) {
    return "employment_law";
  }
  if (/\blayoff|layoffs|restructur|redundan|hiring freeze|headcount|job cuts|office opening|opens office|entity setup|market entry\b/.test(blob)) {
    return "expansion_downsizing";
  }
  if (/\bhrbp\b|\bpeople leader(ship)?\b|\bemployee relations\b|\bperformance\b|\bcompensation\b/.test(blob)) {
    return "hrbp_leadership";
  }
  if (/\bweb3\b|\bcrypto\b|\bdefi\b|\bstablecoin\b|\btoken\b|\bblockchain\b/.test(blob)) return "web3_market";
  if (/\bai\b|\bartificial intelligence\b|\bllm\b|\bmodel\b|\bagents?\b/.test(blob)) return "ai_market";
  return null;
}

type Token =
  | { type: "heading"; text: string }
  | { type: "anchor"; href: string; text: string; snippet?: string };

function tokenizeHtmlForAnchors(htmlInput: string): Token[] {
  const html = decodeEmailText(htmlInput);
  const tokens: Token[] = [];

  // Headings: h1-h3 or strong paragraphs frequently used in email.
  const headingRe =
    /<(h1|h2|h3|strong)[^>]*>([\s\S]*?)<\/\1>/gi;
  const anchorRe =
    /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;

  // One pass: merge events by index.
  const events: Array<{ idx: number; t: Token }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html))) {
    const text = stripTags(m[2] ?? "");
    if (text) events.push({ idx: m.index, t: { type: "heading", text } });
  }
  while ((m = anchorRe.exec(html))) {
    const href = (m[1] ?? m[2] ?? "").trim();
    const text = stripTags(m[3] ?? "");
    // Best-effort snippet: capture a small amount of text immediately following the link.
    // This often contains RSS description-like context in newsletter layouts.
    let snippet: string | undefined;
    if (href) {
      const after = html.slice(anchorRe.lastIndex, Math.min(html.length, anchorRe.lastIndex + 420));
      const stop = after.search(/<(a\b|h1\b|h2\b|h3\b|strong\b)/i);
      const window = stop === -1 ? after : after.slice(0, stop);
      const cleaned = stripTags(window).trim();
      if (cleaned) snippet = cleaned.slice(0, 360);
      events.push({ idx: m.index, t: { type: "anchor", href, text, snippet } });
    }
  }
  events.sort((a, b) => a.idx - b.idx);
  for (const e of events) tokens.push(e.t);
  return tokens;
}

function parseSwiftSectionFromText(args: {
  text: string;
  sectionHeading: string;
  defaultSection: DailyMarketIntelSection;
}): { items: DailyMarketIntelItem[]; declaredItemsCount?: number } {
  const t = decodeEmailText(args.text || "");
  if (!t.trim()) return { items: [] };

  const headerIdx = t.toLowerCase().indexOf(args.sectionHeading.toLowerCase());
  if (headerIdx === -1) return { items: [] };
  const afterHeader = t.slice(headerIdx);

  // Stop at next SWIFT section header if present.
  const nextIdxRel = afterHeader
    .slice(args.sectionHeading.length)
    .search(/\n\s*SWIFT\s+[^\n]+\n/i);
  const sectionText =
    nextIdxRel === -1 ? afterHeader : afterHeader.slice(0, args.sectionHeading.length + nextIdxRel);

  const declared = sectionText.match(/\bItems\s*:\s*(\d{1,3})\b/i);
  const declaredItemsCount = declared?.[1] ? Number(declared[1]) : undefined;

  // Split on numbered items "1. Title"
  const parts = sectionText.split(/\n\s*\d+\.\s+/g);
  const items: DailyMarketIntelItem[] = [];
  for (const p of parts.slice(1)) {
    const chunk = p.trim();
    if (!chunk) continue;
    const lines = chunk.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const title = (lines[0] ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;

    const meta = lines[1] ?? "";
    const publisher = meta.includes("·") ? meta.split("·")[0]?.trim() : "";
    const dateGuess = meta.includes("·") ? meta.split("·").slice(-1)[0]?.trim() : undefined;

    const queryLine = lines.find((l) => /^query\s*:/i.test(l));
    const q = queryLine ? queryLine.replace(/^query\s*:\s*/i, "").replace(/^"|"$/g, "").trim() : undefined;

    const url = (chunk.match(/https?:\/\/[^\s\])"'<>]+/i)?.[0] ?? "https://news.google.com").trim();
    items.push({
      title,
      url,
      source: publisher || sourceFromUrl(url),
      rawSection: args.sectionHeading,
      query: q,
      publishedAt: dateGuess,
      rssSnippet: undefined,
    });
  }

  return { items, declaredItemsCount };
}

export async function fetchDailyMarketIntelEmails(): Promise<DailyMarketIntelResult> {
  return runGuardedFetch<DailyMarketIntelResult>({
    key: "gmail-daily-market-intel",
    fallback: () => ({ generatedAt: new Date().toISOString(), emails: [] }),
    logPrefix: "[GMAIL_INTEL]",
    run: async () => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const label = process.env.GMAIL_DAILY_MARKET_INTEL_LABEL || "SWIFT/Daily Market Intel";

  const generatedAt = new Date().toISOString();

  if (!user || !pass) {
    console.warn("Gmail credentials are missing. Skipping Daily Market Intel fetch.");
    return { generatedAt, emails: [] };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
  });
  let mailboxLock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null = null;

  try {
    console.info(`[GMAIL_INTEL] opening IMAP connection label="${label}" user="${user}"`);
    await client.connect();
    mailboxLock = await client.getMailboxLock(label);
    try {
      const messages = client.fetch(
        { since: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
        { envelope: true, source: true },
      );

      const parsedEmails: DailyMarketIntelEmail[] = [];

      for await (const message of messages) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const subject = parsed.subject || "No subject";
        const from = parsed.from?.text || "Unknown sender";
        const date = parsed.date?.toISOString() || new Date().toISOString();
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const text = typeof parsed.text === "string" ? parsed.text : "";

        const sections = emptySections();
        let currentSection: DailyMarketIntelSection | null = null;
        let currentRawSection: string | undefined;

        const tokens = tokenizeHtmlForAnchors(html);
        for (const tok of tokens) {
          if (tok.type === "heading") {
            const s = sectionFromHeadingText(tok.text);
            if (s) {
              currentSection = s;
              currentRawSection = tok.text;
            }
            continue;
          }
          const href = normalizeUrl(tok.href);
          if (isUselessUrl(href)) continue;
          const title = tok.text?.trim() || stripTags(href);
          const rssSnippet =
            typeof tok.snippet === "string" && tok.snippet.trim() ? tok.snippet.trim().slice(0, 600) : undefined;

          const inferred = currentSection ?? inferSectionFromTitle(title, href) ?? "web3_market";
          sections[inferred].push({
            title,
            url: href,
            source: sourceFromUrl(href),
            rawSection: currentRawSection,
            rssSnippet,
          });
        }

        // Targeted fallback: some SWIFT section emails are plain text (numbered items + Dashboard module + Items count)
        // and contain few/no anchors. Parse those explicitly.
        if (text) {
          const lawParsed = parseSwiftSectionFromText({
            text,
            sectionHeading: "SWIFT Employment Law Trends",
            defaultSection: "employment_law",
          });
          if (lawParsed.items.length > 0) {
            sections.employment_law.push(...lawParsed.items);
          }
        }

        // Fallback: if HTML had no anchors, try plain URLs from text (title becomes the URL).
        if (tokens.length === 0 && text) {
          const urls = (decodeEmailText(text).match(/https?:\/\/[^\s\])"'<>]+/gi) ?? [])
            .map(normalizeUrl)
            .filter((u) => !isUselessUrl(u));
          for (const u of urls) {
            const inferred = inferSectionFromTitle(u, u) ?? "web3_market";
            sections[inferred].push({ title: u, url: u, source: sourceFromUrl(u), rawSection: undefined });
          }
        }

        parsedEmails.push({ subject, from, date, sections });
      }

      parsedEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      console.info(`[GMAIL_INTEL] IMAP fetch succeeded count=${parsedEmails.length}`);
      return { generatedAt, emails: parsedEmails.slice(0, 3) };
    } finally {
      mailboxLock.release();
      mailboxLock = null;
    }
  } catch (error) {
    console.error("[GMAIL_INTEL] IMAP fetch failed:", error);
    return { generatedAt, emails: [] };
  } finally {
    if (mailboxLock) {
      try {
        mailboxLock.release();
      } catch {
        // ignore lock release errors
      }
    }
    try {
      await client.logout();
      console.info("[GMAIL_INTEL] IMAP connection closed");
    } catch {
      console.warn("[GMAIL_INTEL] IMAP close failed");
    }
  }
    },
  });
}

