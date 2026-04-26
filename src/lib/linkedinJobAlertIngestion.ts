import {
  computeRoleRelevance35,
  matchesIndustryContext,
  matchesLocationProfile,
} from "@/lib/jobIngestion";
import { isRealJobApplyUrl } from "@/lib/jobApplyUrl";
import { getSupabaseAdmin, isSupabaseStorageConfigured } from "@/lib/supabaseServer";
import type { CleanJobOpportunity } from "@/lib/types";

export const LINKEDIN_PLACEHOLDER_ROLE = "Review LinkedIn listing";
export const LINKEDIN_PLACEHOLDER_COMPANY = "Company to verify";
export const LINKEDIN_PLACEHOLDER_LOCATION = "Location to verify";

const LEGACY_ROLE_SEE_LISTING = /^role\s*\(see listing\)$/i;

/** True when `role` is a real parsed title (not placeholder / legacy copy). */
export function isLinkedInParsedRole(role: string): boolean {
  const r = role.trim();
  if (!r) return false;
  if (r === LINKEDIN_PLACEHOLDER_ROLE) return false;
  if (LEGACY_ROLE_SEE_LISTING.test(r)) return false;
  const lower = r.toLowerCase();
  if (lower.includes("see listing") && lower.length <= 28) return false;
  return true;
}

/** True when `company` is a real employer name. */
export function isLinkedInParsedCompany(company: string): boolean {
  const c = company.trim();
  if (!c) return false;
  const lower = c.toLowerCase();
  if (c === LINKEDIN_PLACEHOLDER_COMPANY || lower === "unknown") return false;
  return true;
}

/** True when `location` is a real geography string. */
export function isLinkedInParsedLocation(location: string): boolean {
  const l = location.trim();
  if (!l) return false;
  if (l === LINKEDIN_PLACEHOLDER_LOCATION) return false;
  const lower = l.toLowerCase();
  if (lower === "see listing") return false;
  return true;
}

export function linkedInParsedMetadata(role: string, company: string, location: string): {
  roleKnown: boolean;
  companyKnown: boolean;
  locationKnown: boolean;
} {
  return {
    roleKnown: isLinkedInParsedRole(role),
    companyKnown: isLinkedInParsedCompany(company),
    locationKnown: isLinkedInParsedLocation(location),
  };
}

export type LinkedInAlertMessage = {
  subject?: string;
  from?: string;
  fromAddress?: string;
  sender?: string;
  date?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  plainText?: string;
  html?: string;
  body?: string;
  links?: { text?: string; url: string }[];
};

const SENIORITY_HINTS = [
  "head",
  "director",
  "vp",
  "vice president",
  "chief",
  "senior",
  "lead",
  "principal",
];

function extractUrlsFromText(text: string): string[] {
  const out: string[] = [];
  const re = /https?:\/\/[^\s<>"')\]}>]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let u = m[0].replace(/[),.;]+$/, "");
    u = u.replace(/&amp;/g, "&");
    out.push(u);
  }
  return out;
}

export function decodeOutlookSafeLink(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("safelinks.protection.outlook.com")) {
      const inner = u.searchParams.get("url");
      if (inner) return decodeURIComponent(inner);
    }
  } catch {
    /* ignore */
  }
  return url;
}

export function normalizeLinkedinJobUrl(raw: string): string {
  const decoded = decodeOutlookSafeLink(raw.trim());
  try {
    const u = new URL(decoded);
    if (!u.hostname.toLowerCase().includes("linkedin.com")) return decoded;
    u.hash = "";
    const drop = new Set(["trk", "trackingId", "mc", "src", "utm_source", "utm_medium", "utm_campaign"]);
    for (const k of [...u.searchParams.keys()]) {
      if (drop.has(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return decoded;
  }
}

export function isLinkedInJobListingUrl(url: string): boolean {
  const inner = decodeOutlookSafeLink(url);
  try {
    const u = new URL(inner);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("linkedin.com")) return false;
    const p = u.pathname.toLowerCase();
    return (
      p.includes("/jobs/") ||
      p.includes("/jobs/view") ||
      p.includes("/comm/jobs/") ||
      p.includes("/job/")
    );
  } catch {
    return false;
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** "Head of People at Acme" or "Role — Company" (short left side). */
function parseRoleCompanyFromLinkText(text: string): { role: string; company: string } | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const cleaned = t.replace(/\s*[-·|]\s*linkedin.*$/i, "").trim();
  const at = cleaned.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at && at[1].length >= 3 && at[2].length >= 2) {
    return { role: at[1].trim(), company: at[2].trim() };
  }
  const dash = cleaned.match(/^(.+?)\s*[—\-]\s*(.+)$/);
  if (dash && dash[1].length < 80 && dash[1].length >= 3 && dash[2].length >= 2) {
    return { role: dash[1].trim(), company: dash[2].trim() };
  }
  return null;
}

/**
 * Lines like "Role at Company in Dubai" or "Role at Company — London".
 */
function parseRoleCompanyLocationFromLine(line: string): {
  role: string;
  company: string;
  location: string;
} | null {
  const t = line.replace(/\s+/g, " ").trim();
  if (t.length < 6) return null;

  const inLoc = t.match(/^(.+?)\s+at\s+(.+?)\s+(?:in|@)\s+(.+)$/i);
  if (
    inLoc &&
    inLoc[1].length >= 3 &&
    inLoc[1].length < 120 &&
    inLoc[2].length >= 2 &&
    inLoc[2].length < 120 &&
    inLoc[3].length >= 2 &&
    inLoc[3].length < 120
  ) {
    return {
      role: inLoc[1].trim(),
      company: inLoc[2].trim(),
      location: inLoc[3].trim(),
    };
  }

  const sep = t.match(/^(.+?)\s+at\s+(.+?)\s*[—\-|·]\s*(.+)$/i);
  if (
    sep &&
    sep[1].length >= 3 &&
    sep[1].length < 120 &&
    sep[2].length >= 2 &&
    sep[2].length < 120 &&
    sep[3].length >= 2 &&
    sep[3].length < 100
  ) {
    return {
      role: sep[1].trim(),
      company: sep[2].trim(),
      location: sep[3].trim(),
    };
  }

  const atOnly = t.match(/^(.+?)\s+at\s+(.+)$/i);
  if (
    atOnly &&
    atOnly[1].length >= 3 &&
    atOnly[1].length < 100 &&
    atOnly[2].length >= 2 &&
    atOnly[2].length < 120
  ) {
    return { role: atOnly[1].trim(), company: atOnly[2].trim(), location: "" };
  }

  return null;
}

function parseFromMessageBodies(m: LinkedInAlertMessage): {
  role: string;
  company: string;
  location: string;
} {
  const chunks: string[] = [];
  for (const f of [m.plainText, m.bodyPreview, m.body]) {
    if (typeof f === "string" && f.trim()) chunks.push(stripHtml(f));
  }
  if (typeof m.html === "string" && m.html.trim()) {
    chunks.push(stripHtml(m.html).slice(0, 6000));
  }
  const text = chunks.join("\n");
  for (const line of text.split(/[\r\n]+/)) {
    const p = parseRoleCompanyLocationFromLine(line.trim());
    if (p && p.role.length >= 3) return p;
  }
  const oneLine = text.replace(/[\r\n]+/g, " ").trim();
  if (oneLine.length > 10) {
    const p = parseRoleCompanyLocationFromLine(oneLine);
    if (p && p.role.length >= 3) return p;
  }
  return { role: "", company: "", location: "" };
}

function inferFromSubject(subject: string): { role: string; company: string } {
  const s = subject.replace(/\s+/g, " ").trim();
  if (!s) return { role: "", company: "" };
  if (/^job alert|^new jobs|^recommended jobs|^linkedin/i.test(s) && !s.includes(":")) {
    return { role: "", company: "" };
  }
  const colon = s.match(/^([^:]+):\s*(.+)$/);
  if (colon) {
    const a = colon[1].trim();
    const b = colon[2].trim();
    if (a.length < 70 && b.length < 100 && b.length > 2) {
      if (/partner|hrbp|people|talent|human resources|HR\b|director|lead|head/i.test(b)) {
        return { role: b, company: a };
      }
      return { role: b, company: a };
    }
  }
  return { role: "", company: "" };
}

function mergeParsedFields(
  linkText: string,
  m: LinkedInAlertMessage,
): { role: string; company: string; location: string } {
  let role = "";
  let company = "";
  let location = "";

  const fromLink = parseRoleCompanyFromLinkText(linkText);
  if (fromLink) {
    role = fromLink.role;
    company = fromLink.company;
  }

  const fromBody = parseFromMessageBodies(m);
  if (!role && fromBody.role) role = fromBody.role;
  if (!company && fromBody.company) company = fromBody.company;
  if (!location && fromBody.location) location = fromBody.location;

  const fromSub = inferFromSubject(typeof m.subject === "string" ? m.subject : "");
  if (!role && fromSub.role) role = fromSub.role;
  if (!company && fromSub.company) company = fromSub.company;

  return { role, company, location };
}

function senioritySlice(role: string, blob: string): number {
  const t = `${role} ${blob}`.toLowerCase();
  if (SENIORITY_HINTS.some((w) => t.includes(w))) return 15;
  if (t.includes("manager")) return 8;
  return 0;
}

/**
 * Fit for LinkedIn email imports: placeholder role/company/location forces 0 in those slices;
 * incomplete rows cap at 35–55; 80+ only with parsed metadata plus industry or seniority and solid role match.
 */
export function computeLinkedInImportFitScore(input: {
  roleKnown: boolean;
  companyKnown: boolean;
  locationKnown: boolean;
  roleDisplay: string;
  companyDisplay: string;
  /** Parsed location text when known; used only for SWIFT location-profile match. */
  locationDisplay: string;
  blob: string;
  applyUrl: string;
}): number {
  const { roleDisplay, companyDisplay, locationDisplay, blob, applyUrl } = input;

  const effectiveRoleKnown =
    input.roleKnown && isLinkedInParsedRole(roleDisplay);
  const effectiveCompanyKnown =
    input.companyKnown && isLinkedInParsedCompany(companyDisplay);
  const effectiveLocationKnown =
    input.locationKnown && isLinkedInParsedLocation(locationDisplay);

  let roleScore = 0;
  if (effectiveRoleKnown) {
    roleScore = computeRoleRelevance35(roleDisplay, blob);
  }

  let ind = 0;
  if (matchesIndustryContext(blob, false)) ind = 25;

  let loc = 0;
  if (effectiveLocationKnown && locationDisplay.trim()) {
    const locText = `${locationDisplay} ${blob}`;
    if (matchesLocationProfile(locText)) loc = 15;
  }

  let sen = 0;
  if (effectiveRoleKnown) {
    sen = senioritySlice(roleDisplay, blob);
  }

  let app = 3;
  if (isRealJobApplyUrl(applyUrl)) {
    if (effectiveCompanyKnown) app = 10;
    else app = 2;
  }

  let total = roleScore + ind + loc + sen + app;
  const incomplete =
    !effectiveRoleKnown || !effectiveCompanyKnown || !effectiveLocationKnown;
  if (incomplete) {
    total = Math.max(35, Math.min(55, total));
  } else if (total >= 80) {
    const industryOrSeniority = ind > 0 || sen > 0;
    const roleStrongEnough = roleScore >= 22;
    if (!industryOrSeniority || !roleStrongEnough) {
      total = 79;
    }
  }

  return Math.min(100, Math.max(0, total));
}

function messageBlob(m: LinkedInAlertMessage): string {
  return [
    m.subject,
    m.bodyPreview,
    m.plainText,
    m.body,
    m.html,
    ...(m.links ?? []).map((l) => `${l.text ?? ""} ${l.url}`),
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n");
}

function collectCandidateUrls(m: LinkedInAlertMessage): string[] {
  const raw: string[] = [];
  for (const l of m.links ?? []) {
    if (l.url) raw.push(l.url);
  }
  for (const field of [m.html, m.body, m.plainText, m.bodyPreview, m.subject]) {
    if (typeof field === "string") raw.push(...extractUrlsFromText(field));
  }
  const linked = new Set<string>();
  for (const u of raw) {
    if (!isLinkedInJobListingUrl(u)) continue;
    linked.add(normalizeLinkedinJobUrl(u));
  }
  return [...linked];
}

function parseEmailDate(m: LinkedInAlertMessage): string | null {
  const raw = m.receivedDateTime ?? m.date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type StoredImportedJobAlert = {
  id: string;
  source: string;
  role: string | null;
  company: string | null;
  location: string | null;
  apply_url: string | null;
  source_url: string | null;
  fit_score: number | null;
  status: string | null;
  created_at?: string;
  email_subject?: string | null;
  raw_json?: Record<string, unknown> | null;
};

export type LinkedInParseConfidence = {
  roleKnown: boolean;
  companyKnown: boolean;
  locationKnown: boolean;
};

function buildBlobForStoredLinkedInRow(row: StoredImportedJobAlert): string {
  const subj = typeof row.email_subject === "string" ? row.email_subject : "";
  const rj = row.raw_json;
  const extra =
    rj && typeof rj === "object"
      ? `${String((rj as Record<string, unknown>).subject ?? "")} ${String((rj as Record<string, unknown>).linkText ?? "")}`
      : "";
  return `${subj} ${extra}`.trim();
}

/** Recompute fit from DB row (ignores stale `fit_score` from older logic). */
export function recomputeLinkedInImportFitScore(row: StoredImportedJobAlert): number {
  const role = (row.role ?? "").trim() || LINKEDIN_PLACEHOLDER_ROLE;
  const company = (row.company ?? "").trim() || LINKEDIN_PLACEHOLDER_COMPANY;
  const location = (row.location ?? "").trim() || LINKEDIN_PLACEHOLDER_LOCATION;
  const apply = row.apply_url ?? row.source_url ?? "";
  const { roleKnown, companyKnown, locationKnown } = linkedInParsedMetadata(role, company, location);
  const blob = `${role} ${company} ${location} ${buildBlobForStoredLinkedInRow(row)}`;
  return computeLinkedInImportFitScore({
    roleKnown,
    companyKnown,
    locationKnown,
    roleDisplay: role,
    companyDisplay: company,
    locationDisplay: location,
    blob,
    applyUrl: apply,
  });
}

export function isLinkedInImportIncomplete(
  row: Pick<StoredImportedJobAlert, "role" | "company" | "location" | "raw_json">,
): boolean {
  const r = (row.role ?? "").trim() || LINKEDIN_PLACEHOLDER_ROLE;
  const c = (row.company ?? "").trim() || LINKEDIN_PLACEHOLDER_COMPANY;
  const l = (row.location ?? "").trim() || LINKEDIN_PLACEHOLDER_LOCATION;
  const meta = linkedInParsedMetadata(r, c, l);
  return !meta.roleKnown || !meta.companyKnown || !meta.locationKnown;
}

/**
 * Ingest LinkedIn job alert payloads from Power Automate / Outlook (no page scraping).
 */
export async function ingestLinkedInJobAlerts(input: {
  source?: string;
  messages: LinkedInAlertMessage[];
}): Promise<{
  status: "ok" | "error";
  importedCount: number;
  skippedCount: number;
  jobs: Record<string, unknown>[];
  error?: string;
}> {
  const source = (input.source ?? "linkedin_job_alert_outlook").trim() || "linkedin_job_alert_outlook";
  const jobsOut: Record<string, unknown>[] = [];
  let importedCount = 0;
  let skippedCount = 0;

  try {
    if (!isSupabaseStorageConfigured()) {
      return {
        status: "error",
        importedCount: 0,
        skippedCount: 0,
        jobs: [],
        error: "Supabase storage is not configured",
      };
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return {
        status: "error",
        importedCount: 0,
        skippedCount: 0,
        jobs: [],
        error: "Supabase client unavailable",
      };
    }

    const rowsToInsert: Record<string, unknown>[] = [];
    const seenInBatch = new Set<string>();

    for (const m of input.messages ?? []) {
      const urls = collectCandidateUrls(m);
      if (urls.length === 0) {
        skippedCount++;
        continue;
      }
      const emailFrom =
        [m.fromAddress, m.sender, m.from].find((x) => typeof x === "string" && x.trim()) ?? "";
      const emailSubject = typeof m.subject === "string" ? m.subject : "";
      const emailDate = parseEmailDate(m);
      const blob = messageBlob(m);

      for (const applyUrl of urls) {
        const norm = normalizeLinkedinJobUrl(applyUrl);
        if (seenInBatch.has(norm)) {
          skippedCount++;
          continue;
        }
        seenInBatch.add(norm);

        const linkText =
          (m.links ?? []).find((l) => normalizeLinkedinJobUrl(l.url) === norm)?.text ?? "";
        const parsed = mergeParsedFields(linkText, m);

        const roleKnown = parsed.role.trim().length > 0;
        const companyKnown = parsed.company.trim().length > 0;
        const locationKnown = parsed.location.trim().length > 0;

        const roleStored = roleKnown ? parsed.role.trim() : LINKEDIN_PLACEHOLDER_ROLE;
        const companyStored = companyKnown ? parsed.company.trim() : LINKEDIN_PLACEHOLDER_COMPANY;
        const locationStored = locationKnown ? parsed.location.trim() : LINKEDIN_PLACEHOLDER_LOCATION;

        const fitScore = computeLinkedInImportFitScore({
          roleKnown,
          companyKnown,
          locationKnown,
          roleDisplay: roleStored,
          companyDisplay: companyStored,
          locationDisplay: locationStored,
          blob: `${parsed.role} ${parsed.company} ${parsed.location} ${emailSubject} ${blob}`,
          applyUrl: norm,
        });

        const parseConfidence: LinkedInParseConfidence = {
          roleKnown,
          companyKnown,
          locationKnown,
        };

        rowsToInsert.push({
          source,
          role: roleStored,
          company: companyStored,
          location: locationStored,
          apply_url: norm,
          source_url: norm,
          email_subject: emailSubject || null,
          email_from: String(emailFrom).slice(0, 500) || null,
          email_date: emailDate,
          fit_score: fitScore,
          status: "to_review",
          notes: "Imported from email alert payload (not scraped from LinkedIn pages).",
          raw_json: {
            subject: emailSubject,
            linkText,
            url: norm,
            parseConfidence,
          },
        });
      }
    }

    if (rowsToInsert.length === 0) {
      return { status: "ok", importedCount: 0, skippedCount, jobs: [] };
    }

    const urls = rowsToInsert.map((r) => String(r.apply_url)).filter(Boolean);
    const { data: existing } = await supabase
      .from("swift_imported_job_alerts")
      .select("apply_url")
      .eq("source", source)
      .in("apply_url", urls);

    const existingSet = new Set(
      (existing ?? []).map((e: { apply_url?: string }) => (e.apply_url ?? "").toLowerCase()),
    );

    const fresh = rowsToInsert.filter((r) => {
      const u = String(r.apply_url ?? "").toLowerCase();
      if (!u || existingSet.has(u)) {
        skippedCount++;
        return false;
      }
      existingSet.add(u);
      return true;
    });

    if (fresh.length === 0) {
      return { status: "ok", importedCount: 0, skippedCount, jobs: [] };
    }

    const { data: inserted, error } = await supabase
      .from("swift_imported_job_alerts")
      .insert(fresh)
      .select("*");

    if (error) {
      return {
        status: "error",
        importedCount: 0,
        skippedCount,
        jobs: [],
        error: error.message,
      };
    }

    importedCount = inserted?.length ?? 0;
    for (const row of inserted ?? []) {
      jobsOut.push(row as Record<string, unknown>);
    }

    return { status: "ok", importedCount, skippedCount, jobs: jobsOut };
  } catch (e) {
    return {
      status: "error",
      importedCount,
      skippedCount,
      jobs: jobsOut,
      error: e instanceof Error ? e.message : "ingest failed",
    };
  }
}

/** Recent rows for debug API and merges. */
export async function fetchRecentImportedJobAlerts(
  limit = 50,
): Promise<StoredImportedJobAlert[]> {
  if (!isSupabaseStorageConfigured()) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("swift_imported_job_alerts")
    .select(
      "id,source,role,company,location,apply_url,source_url,fit_score,status,created_at,email_subject,raw_json",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));

  if (error || !data) return [];
  return data as StoredImportedJobAlert[];
}

/** Map DB imported row to job opportunity shape for SWIFT merge / storage. */
export function importedAlertToJobRecord(row: StoredImportedJobAlert): Record<string, unknown> {
  const apply = row.apply_url ?? row.source_url ?? "";
  const role = (row.role ?? "").trim() || LINKEDIN_PLACEHOLDER_ROLE;
  const company = (row.company ?? "").trim() || LINKEDIN_PLACEHOLDER_COMPANY;
  const location = (row.location ?? "").trim() || LINKEDIN_PLACEHOLDER_LOCATION;
  const rowNorm: StoredImportedJobAlert = { ...row, role, company, location };
  const fit = recomputeLinkedInImportFitScore(rowNorm);
  const needsReview = isLinkedInImportIncomplete({ ...rowNorm, raw_json: row.raw_json });
  const whyThisFits = needsReview
    ? "Needs review — imported from LinkedIn alert; verify role, company and location in listing."
    : `${fit}/100 fit — LinkedIn Job Alert import.`;
  return {
    id: `linkedin-import-${row.id}`,
    role,
    company,
    location,
    source: "LinkedIn Job Alert",
    sourceUrl: row.source_url ?? apply,
    applyUrl: apply,
    dateFound: row.created_at ?? new Date().toISOString(),
    fitScore: fit,
    whyThisFits,
    gaps: [
      "Imported from LinkedIn alert; verify details in listing.",
      "Confirm role title, employer and location on LinkedIn before applying.",
    ],
    recommendedAction: "Open the LinkedIn listing, verify seniority and scope, then shortlist or archive.",
    status: "to_review",
    needsLinkedInReview: needsReview,
  };
}

/** Typed row for live opportunities list (debug jobs API + UI). */
export function importedAlertToCleanOpportunity(row: StoredImportedJobAlert): CleanJobOpportunity {
  const rec = importedAlertToJobRecord(row);
  const r = rec as Record<string, unknown>;
  const gapsVal = r.gaps;
  const gaps = Array.isArray(gapsVal)
    ? (gapsVal as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const st = r.status === "to_review" ? "to_review" : "live";
  return {
    id: String(r.id ?? ""),
    role: String(r.role ?? LINKEDIN_PLACEHOLDER_ROLE),
    company: String(r.company ?? LINKEDIN_PLACEHOLDER_COMPANY),
    location: String(r.location ?? LINKEDIN_PLACEHOLDER_LOCATION),
    source: String(r.source ?? "LinkedIn Job Alert"),
    sourceUrl: String(r.sourceUrl ?? r.applyUrl ?? ""),
    applyUrl: String(r.applyUrl ?? ""),
    dateFound: String(r.dateFound ?? new Date().toISOString()),
    fitScore: typeof r.fitScore === "number" ? r.fitScore : 0,
    whyThisFits: String(
      r.whyThisFits ??
        "Fit from LinkedIn alert import — verify role, employer and location on the listing.",
    ),
    gaps: gaps.length
      ? gaps
      : [
          "Imported from LinkedIn alert; verify details in listing.",
          "Confirm role title, employer and location on LinkedIn before applying.",
        ],
    recommendedAction: String(
      r.recommendedAction ??
        "Open the LinkedIn listing, verify seniority and scope, then shortlist or archive.",
    ),
    status: st,
    needsLinkedInReview: Boolean(r.needsLinkedInReview),
  };
}
