import { generateGeoAiDailyBrief } from "@/lib/geoAiDailyBrief";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel cron uses UTC, and the Hobby plan must keep this to one daily run.
// The configured run should land after the usual Google Alert arrival window;
// this guard keeps scheduled sends in the intended 09:15 UK window.
function londonScheduleWindow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number.parseInt(lookup.get("hour") || "", 10);
  const minute = Number.parseInt(lookup.get("minute") || "", 10);
  return hour === 9 && minute >= 15 && minute <= 29;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return Response.json(
      { status: "error", message: "Missing CRON_SECRET" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  if (!londonScheduleWindow()) {
    return Response.json({
      status: "ok",
      ok: true,
      skipped: true,
      message: "Outside the 09:15 UK scheduled run window.",
    });
  }

  try {
    const result = await generateGeoAiDailyBrief({
      trigger: "scheduled",
      sendEmail: true,
      forceSendEmail: false,
    });

    return Response.json({
      status: "ok",
      ok: true,
      message:
        result.message ||
        (result.duplicateSkipped
          ? "Scheduled GEO x AI brief email already exists for today."
          : "Scheduled GEO x AI brief generated."),
      duplicateSkipped: result.duplicateSkipped === true,
      generatedAt: result.brief?.generatedAt ?? null,
      report: result.brief,
      empty: result.empty === true,
      storage: result.storage,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        ok: false,
        message: error instanceof Error ? error.message : "Scheduled GEO x AI brief failed",
      },
      { status: 500 },
    );
  }
}
