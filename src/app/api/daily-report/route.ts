import { generateReport } from "@/lib/generateReport";
import { sendReportEmail } from "@/lib/sendReportEmail";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return Response.json(
      { status: "error", message: "Missing CRON_SECRET" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  }

  const report = await generateReport();
  const emailResult = await sendReportEmail(report);

  return Response.json({
    status: "ok",
    message: "Daily report generated and email sent successfully.",
    emailResult,
    report,
  });
}
