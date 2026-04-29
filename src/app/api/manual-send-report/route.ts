import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { generateSwiftIntelligenceReport } from "@/lib/swiftIntelligenceReport";

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
    const result = await generateSwiftIntelligenceReport({ source: "manual", sendEmail: true });
    return jsonResponseNoStore({
      status: "ok",
      ok: true,
      message: "Manual report generated and email attempted successfully.",
      storage: result.storage,
      report: result.dashboardReport,
      rawReport: result.report,
      emailStatus: result.emailStatus,
      emailMessageId: result.emailMessageId,
      triageUsed: result.triageUsed,
      gmailIntelDiagnostics: result.gmailIntelDiagnostics ?? null,
    });
  } catch (error) {
    return jsonResponseNoStore(
      {
        status: "error",
        message: `Manual send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    );
  }
}
