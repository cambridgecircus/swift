import { NextResponse } from "next/server";
import { getLinkedInJobEmailsCached } from "@/lib/linkedinOpportunitiesCache";
import { normalizeLinkedinJobUrl } from "@/lib/linkedinJobAlertIngestion";

function canonicalizeLinkedInJobUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  const normalized = normalizeLinkedinJobUrl(rawUrl);
  try {
    const u = new URL(normalized);
    u.hash = "";
    u.search = "";
    const m = u.pathname.match(/\/(jobs|comm\/jobs)\/view\/(\d+)/i);
    if (m?.[2]) return `https://www.linkedin.com/jobs/view/${m[2]}`;
    return u.toString();
  } catch {
    return normalized;
  }
}

function parseBooleanQuery(v: string | null): boolean {
  return ["1", "true", "yes"].includes((v ?? "").toLowerCase());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = ["1", "true", "yes"].includes(
    (url.searchParams.get("refresh") ?? "").toLowerCase(),
  );

  const raw = parseBooleanQuery(url.searchParams.get("raw"));
  const limitRaw = url.searchParams.get("limit");
  const limitNum = Number.parseInt(limitRaw ?? "", 10);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(20, limitNum)) : 10;

  if (forceRefresh) {
    console.info("[LINKEDIN_GMAIL] force refresh requested");
  }
  const { emails, meta } = await getLinkedInJobEmailsCached({
    forceRefresh,
    awaitRefresh: forceRefresh,
  });

  if (forceRefresh && meta.error) {
    if (meta.errorDiagnostics) {
      console.error("[LINKEDIN_GMAIL] Gmail refresh failed with diagnostics", meta.errorDiagnostics);
    }
    return NextResponse.json(
      {
        ok: false,
        error: meta.error,
        linkedInCache: { ...meta, forceRefresh },
        imapDiagnostics: meta.errorDiagnostics,
        count: emails.length,
        emails: [],
      },
      { status: 500 },
    );
  }

  const limited = emails.slice(0, limit);

  if (raw) {
    return NextResponse.json({
      ok: true,
      linkedInCache: { ...meta, forceRefresh },
      count: limited.length,
      emails: limited.map((email) => ({
        subject: email.subject,
        from: email.from,
        date: email.date,
        primaryUrl: canonicalizeLinkedInJobUrl(email.primaryUrl) ?? email.primaryUrl ?? null,
        urls: email.urls.slice(0, 20).map((u) => canonicalizeLinkedInJobUrl(u) ?? u).filter(Boolean),
        rawUrls: email.rawUrls.slice(0, 20),
        preview: email.text.slice(0, 500),
      })),
    });
  }

  return NextResponse.json({
    ok: true,
    linkedInCache: { ...meta, forceRefresh },
    count: limited.length,
    emails: limited.map((email) => ({
      date: email.date,
      from: email.from,
      primaryUrl: canonicalizeLinkedInJobUrl(email.primaryUrl) ?? null,
      urlsCount: Array.isArray(email.urls) ? email.urls.length : 0,
      topUrls: (email.urls ?? []).slice(0, 3).map((u) => canonicalizeLinkedInJobUrl(u) ?? null).filter(Boolean),
    })),
  });
}