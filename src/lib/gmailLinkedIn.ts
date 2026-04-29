import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { runGuardedFetch } from "@/lib/imapFetchGuard";

export type LinkedInJobEmail = {
  subject: string;
  from: string;
  date: string;
  text: string;
  rawUrls: string[];
  urls: string[];
  primaryUrl?: string;
};

export function decodeEmailUrlText(input: string): string {
  return (
    input
      // quoted-printable soft breaks
      .replace(/=\r?\n/g, "")
      // common QP escapes
      .replaceAll("=3D", "=")
      .replaceAll("=3d", "=")
      .replaceAll("=2F", "/")
      .replaceAll("=2f", "/")
      .replaceAll("=3A", ":")
      .replaceAll("=3a", ":")
      // HTML entity equivalents often appear inside QP blocks
      .replaceAll("&amp;", "&")
      .replaceAll("&#x3D;", "=")
      .replaceAll("&#x3d;", "=")
  );
}

function trimUrlPunctuation(url: string): string {
  return url.replace(/[)\]>"'<.,;:!?]+$/g, "");
}

export function extractHrefUrls(html: string): string[] {
  const out: string[] = [];
  const decoded = decodeEmailUrlText(html);
  const re = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(decoded))) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    if (!raw) continue;
    out.push(trimUrlPunctuation(raw.trim()));
  }
  return out;
}

export function extractPlainUrls(text: string): string[] {
  const decoded = decodeEmailUrlText(text);
  const matches = decoded.match(/https?:\/\/[^\s\])"'<>]+/gi);
  return matches ? matches.map((u) => trimUrlPunctuation(u.trim())) : [];
}

export function isUsefulLinkedInJobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes("linkedin.com")) return false;

    const path = u.pathname || "";
    const allowedPrefixes = [
      "/jobs/view/",
      "/jobs/search/",
      "/jobs/collections/",
      "/comm/jobs/view/",
      "/comm/jobs/search/",
    ] as const;
    if (!allowedPrefixes.some((p) => path.startsWith(p))) return false;

    // Explicitly exclude non-job areas even if they appear on linkedin.com
    const excludedPrefixes = [
      "/help/",
      "/legal/",
      "/psettings/",
      "/email-settings/",
      "/unsubscribe/",
      "/feed/",
      "/learning/",
      "/company/",
      "/in/",
    ] as const;
    if (excludedPrefixes.some((p) => path.startsWith(p))) return false;

    // IMPORTANT: do not reject valid job URLs because of tracking query params.
    return true;
  } catch {
    return false;
  }
}

function isExcludedUrl(url: string): boolean {
  const u = url.toLowerCase();
  const excluded =
    u.includes("unsubscribe") ||
    u.includes("email-settings") ||
    u.includes("help") ||
    u.includes("privacy") ||
    u.includes("legal") ||
    u.includes("notification");
  if (excluded) return true;

  // Exclude tracking/trk only if it's not also jobs (caller will run useful check for jobs).
  const trackingish = u.includes("tracking") || u.includes("trk=");
  if (trackingish && !u.includes("linkedin.com/jobs") && !u.includes("linkedin.com/comm/jobs")) return true;

  return false;
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const v = trimUrlPunctuation(u.trim());
    if (!/^https?:\/\//i.test(v)) continue;
    if (isExcludedUrl(v)) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export async function fetchLinkedInJobAlertEmails(options?: {
  throwOnError?: boolean;
}): Promise<LinkedInJobEmail[]> {
  return runGuardedFetch<LinkedInJobEmail[]>({
    key: "gmail-linkedin-job-alerts",
    fallback: () => [],
    logPrefix: "[GMAIL_LINKEDIN]",
    run: async () => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const label = process.env.GMAIL_LINKEDIN_LABEL || "SWIFT";

  if (!user || !pass) {
    const missing = [
      !user ? "GMAIL_USER" : null,
      !pass ? "GMAIL_APP_PASSWORD" : null,
    ].filter((x): x is string => Boolean(x));
    console.warn(`[GMAIL_LINKEDIN] missing required env vars: ${missing.join(", ")}`);
    if (options?.throwOnError) {
      throw new Error(`Missing required Gmail env vars: ${missing.join(", ")}`);
    }
    return [];
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  const results: LinkedInJobEmail[] = [];
  let mailboxLock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null = null;

  try {
    console.info(`[GMAIL_LINKEDIN] opening IMAP connection label="${label}"`);
    await client.connect();
    mailboxLock = await client.getMailboxLock(label);

    try {
      const messages = client.fetch(
        {
          since: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
        },
        {
          envelope: true,
          source: true,
        }
      );

      for await (const message of messages) {
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const text = typeof parsed.text === "string" ? parsed.text : "";
        const rawSource =
          typeof message.source === "string"
            ? message.source
            : Buffer.isBuffer(message.source)
              ? message.source.toString("utf8")
              : String(message.source);

        const extracted = dedupe([
          ...extractHrefUrls(html),
          ...extractPlainUrls(text),
          ...extractHrefUrls(rawSource),
          ...extractPlainUrls(rawSource),
        ]);

        const rawUrls = extracted;
        const urls = extracted.filter(isUsefulLinkedInJobUrl);
        const primaryUrl = urls[0];

        results.push({
          subject: parsed.subject || "No subject",
          from: parsed.from?.text || "Unknown sender",
          date: parsed.date?.toISOString() || new Date().toISOString(),
          text: text.slice(0, 4000),
          rawUrls,
          urls,
          primaryUrl: primaryUrl || undefined,
        });
      }
    } finally {
      mailboxLock.release();
      mailboxLock = null;
    }
    console.info(`[GMAIL_LINKEDIN] IMAP fetch succeeded count=${results.length}`);
    return results.slice(0, 10);
  } catch (error) {
    console.error("[GMAIL_LINKEDIN] IMAP fetch failed:", error);
    if (options?.throwOnError) throw error;
    return [];
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
      console.info("[GMAIL_LINKEDIN] IMAP connection closed");
    } catch {
      console.warn("[GMAIL_LINKEDIN] IMAP close failed");
    }
  }
    },
  });
}