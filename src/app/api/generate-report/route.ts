import {
  generateGeoAiDailyBrief,
  getGeoAiBriefErrorDebug,
  getLatestGeoAiDailyBrief,
} from "@/lib/geoAiDailyBrief";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const result = await getLatestGeoAiDailyBrief();
  return Response.json({
    ok: true,
    report: result.brief,
    empty: !result.brief,
    storageConfigured: result.storageConfigured,
    error: result.error,
  });
}

export async function POST() {
  console.log("[GEO_AI_BRIEF_API] Refresh brief POST started");
  try {
    const result = await generateGeoAiDailyBrief({
      trigger: "manual",
      sendEmail: true,
      forceSendEmail: true,
    });
    console.log(
      `[GEO_AI_BRIEF_API] Refresh brief POST completed empty=${result.empty === true} generatedAt=${
        result.brief?.generatedAt ?? "null"
      } successfulGmailQuery=${JSON.stringify(result.debug?.successfulGmailQuery)} emailSent=${
        result.brief?.email.sent ?? false
      } emailLabelApplied=${result.brief?.email.labelApplied ?? false} storageSaved=${
        result.storage.saved
      }`,
    );
    return Response.json({
      ok: true,
      generatedAt: result.brief?.generatedAt ?? null,
      report: result.brief,
      empty: result.empty === true,
      message: result.message,
      storage: result.storage,
      debug: process.env.NODE_ENV === "development" ? result.debug : undefined,
    });
  } catch (error) {
    console.error("[GEO_AI_BRIEF_API] Refresh brief POST failed", error);
    const debug = getGeoAiBriefErrorDebug(error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "GEO x AI brief refresh failed",
        debug: process.env.NODE_ENV === "development" ? debug : undefined,
      },
      { status: 500 },
    );
  }
}
