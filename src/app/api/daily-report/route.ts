import { generateGeoAiDailyBrief } from "@/lib/geoAiDailyBrief";

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

  const result = await generateGeoAiDailyBrief();

  return Response.json({
    status: "ok",
    ok: true,
    message: result.empty ? "No recent digest emails found." : "GEO x AI Daily Brief generated.",
    report: result.brief,
    empty: result.empty === true,
    storage: result.storage,
  });
}
