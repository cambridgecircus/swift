import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getLatestRuns } from "@/lib/intelligenceStorage";
import { isSupabaseStorageConfigured } from "@/lib/supabaseServer";
import { inferDashboardModuleSources, normalizeDashboardReport } from "@/lib/dashboardReportMapper";

export const dynamic = "force-dynamic";

export async function GET() {
  const storageConfigured = isSupabaseStorageConfigured();
  const { runs } = await getLatestRuns(1);
  const run = runs?.[0];
  const report = normalizeDashboardReport(run && typeof run === "object" ? { run } : null);

  const rawReport = run && typeof run === "object" ? (run as Record<string, unknown>).report_json : null;
  const reportHasRawJson =
    rawReport != null &&
    (typeof rawReport === "object" ||
      (typeof rawReport === "string" && rawReport.trim().startsWith("{")));
  const reportJsonKeys =
    rawReport && typeof rawReport === "object" ? Object.keys(rawReport as Record<string, unknown>) : [];
  const rawText =
    typeof rawReport === "string"
      ? rawReport
      : rawReport && typeof rawReport === "object"
        ? JSON.stringify(rawReport)
        : "";
  const employmentLawRawSectionFound = /SWIFT Employment Law Trends/i.test(rawText);
  const employmentLawAvailableTextLength = rawText.length;
  const employmentLawParseSource =
    (report?.employmentLaw?.items?.length ?? 0) > 0 ? "report_json" : employmentLawRawSectionFound ? "rawReport_text" : "not_found";

  const moduleSources =
    rawReport && typeof rawReport === "object"
      ? inferDashboardModuleSources(rawReport as Record<string, unknown>)
      : rawReport && typeof rawReport === "string"
        ? (() => {
            try {
              const o = JSON.parse(rawReport) as unknown;
              return o && typeof o === "object" ? inferDashboardModuleSources(o as Record<string, unknown>) : null;
            } catch {
              return null;
            }
          })()
        : null;
  const rawReportObj = rawReport && typeof rawReport === "object" ? (rawReport as Record<string, unknown>) : null;
  const triageUsed =
    rawReportObj?.triageUsed === true || rawReportObj?.aiTriageUsed === true;
  const gmailIntelDiagnostics =
    rawReportObj && typeof rawReportObj.gmailIntelDiagnostics === "object"
      ? rawReportObj.gmailIntelDiagnostics
      : null;

  return jsonResponseNoStore({
    ok: true,
    storageConfigured,
    hasLatestRun: Boolean(run),
    // Payload passthrough for the client: the UI calls `normalizeDashboardReport(d)`.
    // Returning the normalized report keeps the dashboard cards consistent with the latest stored run.
    report,
    rawReport,
    headline: typeof (run as Record<string, unknown>)?.headline === "string" ? (run as Record<string, unknown>).headline : null,
    executive_summary:
      typeof (run as Record<string, unknown>)?.executive_summary === "string"
        ? (run as Record<string, unknown>).executive_summary
        : null,
    generated_at: typeof (run as Record<string, unknown>)?.generated_at === "string" ? (run as Record<string, unknown>).generated_at : null,
    generatedAt: report?.generatedAt ?? null,
    reportKeys: run && typeof run === "object" ? Object.keys(run as Record<string, unknown>) : [],
    reportHasRawJson,
    reportJsonKeys,
    moduleSources,
    triageUsed,
    gmailIntelDiagnostics,
    modules: {
      web3AiBrief: {
        exists: Boolean(report?.web3AiBrief),
        signalCount: report?.web3AiBrief?.signals?.length ?? 0,
        sourceCount: report?.web3AiBrief?.sources?.length ?? 0,
        sampleSignals: (report?.web3AiBrief?.signals ?? []).slice(0, 4),
        sampleSourceTitles: (report?.web3AiBrief?.sources ?? []).slice(0, 5).map((x) => x.title),
      },
      hrbpBrief: {
        exists: Boolean(report?.hrbpBrief),
        signalCount: report?.hrbpBrief?.signals?.length ?? 0,
        sourceCount: report?.hrbpBrief?.sources?.length ?? 0,
        sampleSignals: (report?.hrbpBrief?.signals ?? []).slice(0, 4),
        sampleSourceTitles: (report?.hrbpBrief?.sources ?? []).slice(0, 5).map((x) => x.title),
      },
      employmentLaw: {
        exists: Boolean(report?.employmentLaw),
        itemCount: report?.employmentLaw?.items?.length ?? 0,
        signalCount: report?.employmentLaw?.signals?.length ?? 0,
        sourceCount: report?.employmentLaw?.items?.length ?? 0,
        sampleTitles: (report?.employmentLaw?.items ?? []).slice(0, 5).map((x) => x.title),
        employmentLawParseSource,
        employmentLawRawSectionFound,
        employmentLawParsedItemCount: report?.employmentLaw?.items?.length ?? 0,
        employmentLawSampleTitles: (report?.employmentLaw?.items ?? []).slice(0, 3).map((x) => x.title),
        employmentLawAvailableTextLength,
      },
      expansionDownsizing: {
        exists: Boolean(report?.expansionDownsizing),
        expansionCount: report?.expansionDownsizing?.expansionCount ?? 0,
        downsizingCount: report?.expansionDownsizing?.downsizingCount ?? 0,
        restructuringCount: report?.expansionDownsizing?.restructuringCount ?? 0,
        strongestSignal: report?.expansionDownsizing?.strongestSignal ?? null,
      },
    },
  });
}
