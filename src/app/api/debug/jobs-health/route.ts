import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getLiveJobOpportunities } from "@/lib/jobIngestion";
import { fetchRecentImportedJobAlerts } from "@/lib/linkedinJobAlertIngestion";

export const dynamic = "force-dynamic";

async function safe<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const value = await p;
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function GET() {
  const live = await safe(getLiveJobOpportunities());
  const imported = await safe(fetchRecentImportedJobAlerts(50));

  const importedJobCount = imported.ok ? imported.value.length : 0;
  const renderedJobCountCandidate =
    live.ok && Array.isArray(live.value.opportunities) ? live.value.opportunities.length : 0;
  const sampleJob =
    live.ok && Array.isArray(live.value.opportunities) && live.value.opportunities[0]
      ? live.value.opportunities[0]
      : imported.ok && imported.value[0]
        ? imported.value[0]
        : null;

  return jsonResponseNoStore({
    ok: true,
    importedJobsEndpointOk: imported.ok,
    jobsEndpointOk: live.ok,
    importedJobCount,
    renderedJobCountCandidate,
    sampleJob,
    frontendRecommendedEndpoint: "/api/debug/jobs",
    errors: {
      imported: imported.ok ? null : imported.error,
      jobs: live.ok ? null : live.error,
    },
  });
}

