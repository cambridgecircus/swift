import { generateSwiftIntelligenceReport } from "@/lib/swiftIntelligenceReport";

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

  const result = await generateSwiftIntelligenceReport({ source: "daily", sendEmail: true });

  return Response.json({
    status: "ok",
    ok: true,
    message: "Daily report generated and email attempted successfully.",
    report: result.dashboardReport,
    rawReport: result.report,
    storage: result.storage,
    emailStatus: result.emailStatus,
    emailMessageId: result.emailMessageId,
  });
}
