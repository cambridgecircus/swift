import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getLiveJobOpportunities } from "@/lib/jobIngestion";
import { getLinkedInJobEmailsCached } from "@/lib/linkedinOpportunitiesCache";
import {
  fetchRecentImportedJobAlerts,
  importedAlertToCleanOpportunity,
  importedAlertToJobRecord,
} from "@/lib/linkedinJobAlertIngestion";

export const dynamic = "force-dynamic";

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        t = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function extractLinkedInJobId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes("linkedin.com")) return null;
    const m =
      u.pathname.match(/\/jobs\/view\/(\d+)/i) ??
      u.pathname.match(/\/comm\/jobs\/view\/(\d+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function isPlaceholderLinkedInUrl(url: string): boolean {
  return /linkedin\.com\/jobs\/view\/1234567890/i.test(url);
}

function cleanCandidateLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isLikelyNoiseLine(line: string): boolean {
  const l = line.toLowerCase();
  return (
    !l ||
    l.length < 2 ||
    l.startsWith("http://") ||
    l.startsWith("https://") ||
    l.includes("linkedin.com/") ||
    l.includes("unsubscribe") ||
    l.includes("notification") ||
    l.includes("privacy") ||
    l.includes("terms") ||
    l.includes("manage your") ||
    l.includes("email preferences") ||
    l.includes("view job")
  );
}

function parseTitleCompanyFromLine(line: string): { title?: string; company?: string } {
  const c = cleanCandidateLine(line);
  if (!c) return {};
  const atMatch = c.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch?.[1] && atMatch?.[2]) {
    return { title: atMatch[1].trim(), company: atMatch[2].trim() };
  }
  return {};
}

function isNoisyLinkedInAlertText(input: string): boolean {
  const v = cleanCandidateLine(input).toLowerCase();
  return (
    !v ||
    v.includes("your job alert has been created") ||
    v.includes("your job alert for") ||
    v.includes("boolean search") ||
    v.includes("saved search") ||
    v.includes("((") ||
    v.includes("\" or ") ||
    v.length > 140
  );
}

function looksLikeLocation(line: string): boolean {
  const l = line.toLowerCase();
  return (
    l.includes("remote") ||
    l.includes("hybrid") ||
    l.includes("on-site") ||
    l.includes("onsite") ||
    l.includes("location") ||
    l.includes(",")
  );
}

function parseHintForLinkedInUrl(args: {
  subject: string;
  text: string;
  url: string;
}): { title?: string; company?: string; location?: string } {
  const lines = args.text
    .split(/\r?\n/)
    .map(cleanCandidateLine)
    .filter((x) => x.length > 0);

  const subjectHint = isNoisyLinkedInAlertText(args.subject) ? {} : parseTitleCompanyFromLine(args.subject);
  let title = subjectHint.title && !isNoisyLinkedInAlertText(subjectHint.title) ? subjectHint.title : undefined;
  let company =
    subjectHint.company && !isNoisyLinkedInAlertText(subjectHint.company) ? subjectHint.company : undefined;
  let location: string | undefined;

  const urlIdx = lines.findIndex((l) => l.includes(args.url));
  const window = (urlIdx >= 0 ? lines.slice(Math.max(0, urlIdx - 8), urlIdx) : lines.slice(0, 18)).filter(
    (l) => !isLikelyNoiseLine(l),
  );

  for (const line of window) {
    if (!title || !company) {
      const parsed = parseTitleCompanyFromLine(line);
      if (!title && parsed.title && !isNoisyLinkedInAlertText(parsed.title)) title = parsed.title;
      if (!company && parsed.company && !isNoisyLinkedInAlertText(parsed.company)) company = parsed.company;
    }
    if (!location && looksLikeLocation(line)) {
      const maybeLocation = line.replace(/^location[:\-\s]*/i, "").trim();
      if (!isNoisyLinkedInAlertText(maybeLocation)) location = maybeLocation;
    }
  }

  if (!title && window[0] && !isNoisyLinkedInAlertText(window[0])) title = window[0];
  if (!company && window[1] && !looksLikeLocation(window[1]) && !isNoisyLinkedInAlertText(window[1])) {
    company = window[1];
  }

  return {
    title: title?.slice(0, 140),
    company: company?.slice(0, 140),
    location: location?.slice(0, 140),
  };
}

export async function GET(request: Request) {
  // Never let upstream sources block the UI; return quickly with partial data.
  const url = new URL(request.url);
  const forceLinkedInRefresh = ["1", "true", "yes"].includes(
    (url.searchParams.get("linkedinRefresh") ?? "").toLowerCase(),
  );
  if (forceLinkedInRefresh) {
    console.info("[LINKEDIN_JOBS] force refresh requested");
  }
  const data = await withTimeout(getLiveJobOpportunities(), 12_000, {
    status: "ok" as const,
    checkedAt: new Date().toISOString(),
    rawCount: 0,
    cleanCount: 0,
    opportunities: [],
    needsManualReview: [],
    sourceHealth: [],
  });
  const linkedInCached = await getLinkedInJobEmailsCached({
    forceRefresh: forceLinkedInRefresh,
    awaitRefresh: forceLinkedInRefresh,
  });
  if (forceLinkedInRefresh && linkedInCached.meta.error) {
    console.error("[LINKEDIN_JOBS] Gmail refresh failed (returning non-LinkedIn jobs)", {
      error: linkedInCached.meta.error,
      imapDiagnostics: linkedInCached.meta.errorDiagnostics,
    });
  }
  const gmailEmails = linkedInCached.emails;
  const gmailUrls = (gmailEmails ?? [])
    .flatMap((e) => (Array.isArray(e.urls) ? e.urls : []))
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  const gmailPrimaryUrls = (gmailEmails ?? [])
    .map((e) => (typeof e.primaryUrl === "string" ? e.primaryUrl : ""))
    .filter((u): u is string => Boolean(u));
  const fallbackGmailUrl = gmailPrimaryUrls[0] ?? gmailUrls[0] ?? "";

  const gmailOpps = (() => {
    const out: typeof data.opportunities = [];
    const seen = new Set<string>();
    const seenTuple = new Set<string>();
    let titleParsedCount = 0;
    let companyParsedCount = 0;
    let fallbackUsedCount = 0;

    for (const email of gmailEmails) {
      for (const url of email.urls ?? []) {
        const id = extractLinkedInJobId(url);
        const key = id ? `job:${id}` : `url:${url.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const parsed = parseHintForLinkedInUrl({
          subject: email.subject,
          text: email.text,
          url,
        });

        const role =
          parsed.title?.trim() && !isNoisyLinkedInAlertText(parsed.title)
            ? parsed.title.trim()
            : "LinkedIn Job Alert - Needs Review";
        const company =
          parsed.company?.trim() && !isNoisyLinkedInAlertText(parsed.company)
            ? parsed.company.trim()
            : "Company not parsed";
        const location =
          parsed.location?.trim() && !isNoisyLinkedInAlertText(parsed.location)
            ? parsed.location.trim()
            : "Location not parsed";
        const foundDate = email.date || new Date().toISOString();
        const tupleKey = `${role.toLowerCase()}|${company.toLowerCase()}|${location.toLowerCase()}|${foundDate}`;
        if (seenTuple.has(tupleKey)) continue;
        seenTuple.add(tupleKey);

        if (parsed.title?.trim()) titleParsedCount += 1;
        if (parsed.company?.trim()) companyParsedCount += 1;
        if (!parsed.title?.trim() || !parsed.company?.trim()) fallbackUsedCount += 1;

        out.push({
          id: id ? `gmail-linkedin-${id}` : `gmail-linkedin-${seen.size}`,
          role,
          company,
          location,
          source: "LinkedIn Gmail Alert",
          sourceUrl: url,
          applyUrl: url,
          dateFound: foundDate,
          fitScore: 85,
          whyThisFits:
            "LinkedIn alert parsed from Gmail email content. Open LinkedIn to verify role, employer and location.",
          gaps: ["Open LinkedIn to verify role, employer and location before applying."],
          recommendedAction:
            "Open LinkedIn to verify role, employer and location before applying, then shortlist or archive.",
          status: "to_review",
          needsLinkedInReview: true,
        });
        if (out.length >= 25) break;
      }
      if (out.length >= 25) break;
    }
    console.info(
      `[GMAIL_LINKEDIN_PARSE] urls_found=${seen.size} titles_parsed=${titleParsedCount} companies_parsed=${companyParsedCount} fallback_jobs=${fallbackUsedCount}`,
    );
    return out;
  })();

  const scrubPlaceholderUrl = (u: string): string => {
    if (!u) return "";
    if (isPlaceholderLinkedInUrl(u)) return fallbackGmailUrl || "";
    return u;
  };

  let importedLinkedIn: Record<string, unknown>[] = [];
  if (forceLinkedInRefresh && linkedInCached.meta.error) {
    const merged = [...gmailOpps, ...data.opportunities].map((o) => ({
      ...o,
      applyUrl: scrubPlaceholderUrl(o.applyUrl),
      sourceUrl: scrubPlaceholderUrl(o.sourceUrl),
    }));
    console.info(`[LINKEDIN_JOBS] LinkedIn opportunities merged count=${gmailOpps.length}`);
    return jsonResponseNoStore({
      ...data,
      opportunities: merged,
      importedLinkedIn: [],
      linkedInOpportunities: gmailOpps,
      linkedInOpportunitiesMergedCount: gmailOpps.length,
      linkedInCache: {
        ...linkedInCached.meta,
        forceRefresh: forceLinkedInRefresh,
      },
      imapDiagnostics: linkedInCached.meta.errorDiagnostics,
    });
  }
  try {
    const rows = await fetchRecentImportedJobAlerts(50);
    importedLinkedIn = rows.map((r) => {
      const rec = importedAlertToJobRecord(r);
      const apply = typeof rec.applyUrl === "string" ? rec.applyUrl : "";
      const src = typeof rec.sourceUrl === "string" ? rec.sourceUrl : "";
      if (apply && isPlaceholderLinkedInUrl(apply)) rec.applyUrl = scrubPlaceholderUrl(apply);
      if (src && isPlaceholderLinkedInUrl(src)) rec.sourceUrl = scrubPlaceholderUrl(src);
      return rec;
    });
    const linkedOpps = rows.map((r) => {
      const opp = importedAlertToCleanOpportunity(r);
      opp.applyUrl = scrubPlaceholderUrl(opp.applyUrl);
      opp.sourceUrl = scrubPlaceholderUrl(opp.sourceUrl);
      return opp;
    });
    const seenApply = new Set(data.opportunities.map((o) => o.applyUrl.toLowerCase()));
    const merged = [...gmailOpps, ...data.opportunities];
    for (const o of gmailOpps) {
      const k = o.applyUrl.toLowerCase();
      if (!k) continue;
      seenApply.add(k);
    }
    for (const o of linkedOpps) {
      const k = o.applyUrl.toLowerCase();
      if (!k || seenApply.has(k)) continue;
      seenApply.add(k);
      merged.push(o);
    }
    // Final scrub: ensure placeholder URL is never returned.
    for (const o of merged) {
      if (isPlaceholderLinkedInUrl(o.applyUrl)) o.applyUrl = scrubPlaceholderUrl(o.applyUrl);
      if (isPlaceholderLinkedInUrl(o.sourceUrl)) o.sourceUrl = scrubPlaceholderUrl(o.sourceUrl);
    }
    merged.sort((a, b) => b.fitScore - a.fitScore || a.role.localeCompare(b.role));
    console.info(`[LINKEDIN_JOBS] LinkedIn opportunities merged count=${gmailOpps.length}`);
    return jsonResponseNoStore({
      ...data,
      opportunities: merged,
      importedLinkedIn,
      linkedInCache: {
        ...linkedInCached.meta,
        forceRefresh: forceLinkedInRefresh,
      },
      linkedInOpportunities: gmailOpps,
      linkedInOpportunitiesMergedCount: gmailOpps.length,
    });
  } catch {
    importedLinkedIn = [];
  }
  const merged = [...gmailOpps, ...data.opportunities].map((o) => ({
    ...o,
    applyUrl: scrubPlaceholderUrl(o.applyUrl),
    sourceUrl: scrubPlaceholderUrl(o.sourceUrl),
  }));
  console.info(`[LINKEDIN_JOBS] LinkedIn opportunities merged count=${gmailOpps.length}`);
  return jsonResponseNoStore({
    ...data,
    opportunities: merged,
    importedLinkedIn,
    linkedInCache: {
      ...linkedInCached.meta,
      forceRefresh: forceLinkedInRefresh,
    },
    linkedInOpportunities: gmailOpps,
    linkedInOpportunitiesMergedCount: gmailOpps.length,
  });
}
