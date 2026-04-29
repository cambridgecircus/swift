import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getLatestRuns } from "@/lib/intelligenceStorage";
import { isSupabaseStorageConfigured } from "@/lib/supabaseServer";
import { normalizeDashboardReport } from "@/lib/dashboardReportMapper";

export const dynamic = "force-dynamic";

export async function GET() {
  const storageConfigured = isSupabaseStorageConfigured();
  const { runs } = await getLatestRuns(1);
  const run = runs?.[0];
  const report = normalizeDashboardReport(run && typeof run === "object" ? { run } : null);

  const keys = run && typeof run === "object" ? Object.keys(run as Record<string, unknown>) : [];
  const hasLatestReport = Boolean(report);

  return jsonResponseNoStore({
    ok: true,
    storageConfigured,
    hasLatestReport,
    generatedAt: report?.generatedAt ?? null,
    hasWeb3AiBrief: Boolean(report?.web3AiBrief?.signals?.length),
    hasHrbpBrief: Boolean(report?.hrbpBrief?.signals?.length),
    hasEmploymentLaw: Boolean(report?.employmentLaw?.items?.length),
    employmentLawItemCount: report?.employmentLaw?.items?.length ?? 0,
    hasExpansionDownsizing:
      Boolean(report?.expansionDownsizing) &&
      (report?.expansionDownsizing?.expansionCount ?? 0) +
        (report?.expansionDownsizing?.downsizingCount ?? 0) +
        (report?.expansionDownsizing?.restructuringCount ?? 0) >
        0,
    expansionCount: report?.expansionDownsizing?.expansionCount ?? 0,
    downsizingCount: report?.expansionDownsizing?.downsizingCount ?? 0,
    restructuringCount: report?.expansionDownsizing?.restructuringCount ?? 0,
    reportKeys: keys,
  });
}

