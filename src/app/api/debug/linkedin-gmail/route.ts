import { NextResponse } from "next/server";
import { fetchLinkedInJobAlertEmails } from "@/lib/gmailLinkedIn";

export async function GET() {
  const emails = await fetchLinkedInJobAlertEmails();

  return NextResponse.json({
    ok: true,
    count: emails.length,
    emails: emails.map((email) => ({
      subject: email.subject,
      from: email.from,
      date: email.date,
      preview: email.text.slice(0, 500),
    })),
  });
}