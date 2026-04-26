import { fetchRecentImportedJobAlerts, recomputeLinkedInImportFitScore } from "@/lib/linkedinJobAlertIngestion";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await fetchRecentImportedJobAlerts(50);
  const jobs = rows.map((r) => ({
    ...r,
    fit_score: recomputeLinkedInImportFitScore(r),
  }));
  return Response.json({ status: "ok", count: jobs.length, jobs });
}
