import { NextResponse } from "next/server";
import { getLinkedInJobEmailsCached } from "@/lib/linkedinOpportunitiesCache";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = ["1", "true", "yes"].includes(
    (url.searchParams.get("refresh") ?? "").toLowerCase(),
  );
  if (forceRefresh) {
    console.info("[LINKEDIN_GMAIL] force refresh requested");
  }
  const { emails, meta } = await getLinkedInJobEmailsCached({
    forceRefresh,
    awaitRefresh: forceRefresh,
  });

  if (forceRefresh && meta.error) {
    return NextResponse.json(
      {
        ok: false,
        error: meta.error,
        linkedInCache: { ...meta, forceRefresh },
        count: emails.length,
        emails: [],
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    linkedInCache: { ...meta, forceRefresh },
    count: emails.length,
    emails: emails.map((email) => ({
      subject: email.subject,
      from: email.from,
      date: email.date,
      primaryUrl: email.primaryUrl,
      urls: email.urls,
      rawUrls: email.rawUrls,
      preview: email.text.slice(0, 500),
    })),
  });
}