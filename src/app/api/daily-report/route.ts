import { runReportAndSendEmail } from "@/lib/reportRunner";

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

  const result = await runReportAndSendEmail({ runType: "scheduled" });

  if (result.status !== "ok") {
    return Response.json(
      { status: "error", message: result.message },
      { status: 500 },
    );
  }

  return Response.json({
    status: "ok",
    message: "Daily report generated and email sent successfully.",
    emailResult: result.emailResult,
    report: result.report,
    storage: result.storage,
  });
}
