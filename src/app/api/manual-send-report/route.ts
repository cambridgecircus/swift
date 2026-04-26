import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { runReportAndSendEmail } from "@/lib/reportRunner";

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

  const result = await runReportAndSendEmail({ runType: "manual" });

  if (result.status !== "ok") {
    return jsonResponseNoStore(
      { status: "error", message: `Manual send failed: ${result.message}` },
      { status: 500 },
    );
  }

  return jsonResponseNoStore({
    status: "ok",
    message: "Manual report generated and email sent successfully.",
    emailResult: result.emailResult,
    storage: result.storage,
    report: result.report,
    liveJobs: result.liveJobs,
    liveJobsTotalDeduped: result.liveJobsTotalDeduped,
    liveJobsHasMore: result.liveJobsHasMore,
    diagnostics: result.diagnostics,
  });
}

