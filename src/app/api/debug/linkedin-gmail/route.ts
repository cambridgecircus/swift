import { NextResponse } from "next/server";
import { getLinkedInJobEmailsCached } from "@/lib/linkedinOpportunitiesCache";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = ["1", "true", "yes"].includes(
    (url.searchParams.get("refresh") ?? "").toLowerCase(),
  );
  const { emails, meta } = await getLinkedInJobEmailsCached({ forceRefresh });

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