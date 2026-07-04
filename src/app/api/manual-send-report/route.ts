import { jsonResponseNoStore } from "@/lib/httpNoStore";
import {
  generateGeoAiDailyBrief,
  getGeoAiBriefErrorDebug,
} from "@/lib/geoAiDailyBrief";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expectedSecret = process.env.MANUAL_REPORT_SECRET;
  if (!expectedSecret) {
    return jsonResponseNoStore(
      { status: "error", message: "Missing MANUAL_REPORT_SECRET" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return jsonResponseNoStore({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateGeoAiDailyBrief({
      trigger: "manual",
      sendEmail: true,
      forceSendEmail: true,
    });
    return jsonResponseNoStore({
      status: "ok",
      ok: true,
      message:
        result.message ||
        (result.brief?.email.sent
          ? "Manual GEO x AI brief generated and email sent."
          : "Manual GEO x AI brief generated; email was not sent."),
      storage: result.storage,
      report: result.brief,
      empty: result.empty === true,
      emailStatus: result.brief?.email.sent ? "sent" : result.brief?.email.error ? "failed" : "skipped",
      emailMessageId: result.brief?.email.messageId,
      debug: process.env.NODE_ENV === "development" ? result.debug : undefined,
    });
  } catch (error) {
    const debug = getGeoAiBriefErrorDebug(error);
    return jsonResponseNoStore(
      {
        status: "error",
        message: `Manual send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        debug: process.env.NODE_ENV === "development" ? debug : undefined,
      },
      { status: 500 },
    );
  }
}
