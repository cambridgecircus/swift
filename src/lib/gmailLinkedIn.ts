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

export type LinkedInImapDiagnostics = {
  stage: "connect" | "authenticate" | "mailboxOpen" | "search" | "fetch" | "logout" | "unknown";
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  response?: unknown;
  responseStatus?: unknown;
  serverResponseCode?: unknown;
  executedCommand?: string;
  responseText?: unknown;
  authenticationFailed?: boolean;
  code?: unknown;
  errno?: unknown;
  syscall?: unknown;
  hostname?: string;
  command?: string;
  mailbox?: string;
  imapHost?: string;
  envPresent?: {
    GMAIL_USER: boolean;
    GMAIL_APP_PASSWORD: boolean;
  };
};

type ErrorWithImapDiagnostics = Error & {
  imapDiagnostics?: LinkedInImapDiagnostics;
};

type ImapErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  response?: unknown;
  responseStatus?: unknown;
  serverResponseCode?: unknown;
  executedCommand?: unknown;
  responseText?: unknown;
  authenticationFailed?: unknown;
  code?: unknown;
  errno?: unknown;
  syscall?: unknown;
  hostname?: unknown;
  command?: unknown;
  imap?: {
    hostname?: unknown;
    command?: unknown;
  };
};

function firstThreeStackLines(stack: unknown): string | undefined {
  if (!stack) return undefined;
  const s = String(stack);
  const lines = s.split("\n").map((l) => l.trimEnd());
  if (lines.length <= 3) return lines.join("\n");
  return lines.slice(0, 3).join("\n");
}

function buildImapDiagnostics(args: {
  stage: LinkedInImapDiagnostics["stage"];
  error: unknown;
  label: string;
  imapHost: string;
}): LinkedInImapDiagnostics {
  const anyErr = args.error && typeof args.error === "object" ? (args.error as ImapErrorLike) : {};
  const responseObj =
    anyErr.response && typeof anyErr.response === "object"
      ? (anyErr.response as { text?: unknown })
      : {};
  const missingUser = !process.env.GMAIL_USER || !String(process.env.GMAIL_USER).trim();
  const missingPass = !process.env.GMAIL_APP_PASSWORD || !String(process.env.GMAIL_APP_PASSWORD).trim();

  const diag: LinkedInImapDiagnostics = {
    stage: args.stage,
    errorName: typeof anyErr.name === "string" ? anyErr.name : undefined,
    errorMessage: anyErr.message ? String(anyErr.message) : String(args.error),
    errorStack: firstThreeStackLines(anyErr?.stack),
    response: anyErr?.response,
    responseStatus: anyErr?.responseStatus,
    serverResponseCode: anyErr?.serverResponseCode,
    executedCommand: typeof anyErr.executedCommand === "string" ? anyErr.executedCommand : undefined,
    responseText:
      anyErr.responseText != null
        ? String(anyErr.responseText)
        : responseObj.text != null
          ? String(responseObj.text)
          : undefined,
    authenticationFailed:
      typeof anyErr.authenticationFailed === "boolean" ? anyErr.authenticationFailed : undefined,
    code: anyErr?.code,
    errno: anyErr?.errno,
    syscall: anyErr?.syscall,
    hostname:
      typeof anyErr.hostname === "string"
        ? anyErr.hostname
        : typeof anyErr.imap?.hostname === "string"
          ? anyErr.imap.hostname
          : undefined,
    command:
      typeof anyErr.command === "string"
        ? anyErr.command
        : typeof anyErr.imap?.command === "string"
          ? anyErr.imap.command
          : undefined,
    mailbox: args.label,
    imapHost: args.imapHost,
    envPresent: {
      GMAIL_USER: !missingUser,
      GMAIL_APP_PASSWORD: !missingPass,
    },
  };

  // Heuristic: distinguish connect vs authenticate when possible.
  if (diag.stage === "connect") {
    const msg = (diag.errorMessage ?? "").toLowerCase();
    if (msg.includes("auth") || msg.includes("authentication") || msg.includes("login")) {
      diag.stage = "authenticate";
    }
  }

  return diag;
}

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
      const imapHost = "imap.gmail.com";

  if (!user || !pass) {
    const missing = [
      !user ? "GMAIL_USER" : null,
      !pass ? "GMAIL_APP_PASSWORD" : null,
    ].filter((x): x is string => Boolean(x));
    console.warn(`[GMAIL_LINKEDIN] missing required env vars: ${missing.join(", ")}`);
    if (options?.throwOnError) {
          const diag = buildImapDiagnostics({
            stage: "authenticate",
            error: new Error(`Missing required Gmail env vars: ${missing.join(", ")}`),
            label,
            imapHost,
          });
          const err: ErrorWithImapDiagnostics = new Error("Missing required Gmail env vars");
          err.imapDiagnostics = diag;
          throw err;
    }
    return [];
  }

  const client = new ImapFlow({
        host: imapHost,
    port: 993,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  const results: LinkedInJobEmail[] = [];
  let mailboxLock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null = null;
      let primaryError: unknown = null;
      let primaryStage: LinkedInImapDiagnostics["stage"] = "unknown";

  try {
    console.info(`[GMAIL_LINKEDIN] opening IMAP connection label="${label}"`);
        try {
          primaryStage = "connect";
          await client.connect();
        } catch (error) {
          primaryError = error;
          primaryStage = "connect";
          throw error;
        }

        try {
          primaryStage = "mailboxOpen";
          mailboxLock = await client.getMailboxLock(label);
        } catch (error) {
          primaryError = error;
          primaryStage = "mailboxOpen";
          throw error;
        }

    try {
          primaryStage = "fetch";
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
        const diag = buildImapDiagnostics({
          stage: primaryStage ?? "unknown",
          error,
          label,
          imapHost,
        });
        console.error("[GMAIL_LINKEDIN] IMAP fetch failed", { stage: diag.stage, errorMessage: diag.errorMessage });
        if (options?.throwOnError) {
          const err: ErrorWithImapDiagnostics =
            error instanceof Error ? error : new Error(diag.errorMessage ?? "Command failed");
          err.imapDiagnostics = diag;
          throw err;
        }
    return [];
  } finally {
    const lock = mailboxLock as { release: () => void } | null;
    if (lock) {
      try {
        lock.release();
      } catch {
        // ignore lock release errors
      }
    }
    try {
          // Only report logout failure when we didn't already fail during connect/auth/mailboxOpen/fetch.
          primaryStage = primaryError ? primaryStage : "logout";
      await client.logout();
      console.info("[GMAIL_LINKEDIN] IMAP connection closed");
    } catch {
      console.warn("[GMAIL_LINKEDIN] IMAP close failed");
          if (!primaryError && options?.throwOnError) {
            const diag = buildImapDiagnostics({
              stage: "logout",
              error: new Error("IMAP logout failed"),
              label,
              imapHost,
            });
            const err: ErrorWithImapDiagnostics = new Error(diag.errorMessage ?? "IMAP logout failed");
            err.imapDiagnostics = diag;
            throw err;
          }
    }
  }
    },
  });
}
