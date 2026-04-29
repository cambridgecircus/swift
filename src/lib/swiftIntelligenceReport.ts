import { generateReport, type IntelligenceReport } from "@/lib/generateReport";
import { gatherReportStorageContext } from "@/lib/reportStorageContext";
import { getSourceRegistrySummary } from "@/lib/sourceRegistrySummary";
import { saveIntelligenceRun } from "@/lib/intelligenceStorage";
import { normalizeDashboardReport } from "@/lib/dashboardReportMapper";
import { sendReportEmail } from "@/lib/sendReportEmail";

export type GenerateSwiftIntelligenceReportOptions = {
  forceFresh?: boolean;
  sendEmail?: boolean;
  source: "manual" | "daily" | "debug";
};

function safeNowIso(): string {
  return new Date().toISOString();
}

export async function generateSwiftIntelligenceReport(
  options: GenerateSwiftIntelligenceReportOptions,
): Promise<{
  ok: true;
  generatedAt: string;
  report: IntelligenceReport;
  dashboardReport: NonNullable<ReturnType<typeof normalizeDashboardReport>>;
  storage: { saved: boolean; runId?: string; error?: string };
  emailStatus?: string;
  emailMessageId?: string;
  triageUsed: boolean;
  gmailIntelDiagnostics?: IntelligenceReport["gmailIntelDiagnostics"];
}> {
  const { sendEmail = false, source } = options;

  if (source === "manual") console.info("[GENERATE_REPORT] manual generation started");
  if (source === "daily") console.info("[DAILY_REPORT] cron started");

  const ctx = await gatherReportStorageContext();
  const sourceRegistrySummary = getSourceRegistrySummary();

  const report = await generateReport({ storageContext: ctx });
  const generatedAt = report.generatedAt || safeNowIso();

  if (source === "daily") {
    console.info("[DAILY_REPORT] report generated generatedAt=" + generatedAt);
  }
  if (source === "manual") {
    console.info("[GENERATE_REPORT] report generated generatedAt=" + generatedAt);
  }

  let emailStatus: string | undefined;
  let emailMessageId: string | undefined;
  if (sendEmail) {
    try {
      const emailResult = await sendReportEmail(report);
      const r = emailResult as { data?: { id?: string }; error?: unknown };
      if (r.error) emailStatus = "failed";
      else {
        emailStatus = "sent";
        if (typeof r.data?.id === "string") emailMessageId = r.data.id;
      }
    } catch (e) {
      emailStatus = "failed";
      // Do not throw on email failure: dashboard must still refresh.
      console.error("[REPORT_EMAIL] email failed (dashboard saving will continue)", {
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const storage = await saveIntelligenceRun({
    runType: source === "daily" ? "scheduled" : "manual",
    report: { ...(report as unknown as Record<string, unknown>) },
    marketSignals: ctx.marketSignals,
    jobOpportunities: ctx.jobOpportunities,
    sourceHealth: ctx.sourceHealth,
    sourceRegistrySummary: sourceRegistrySummary as unknown as Record<string, unknown>,
    rawSignalCount: ctx.rawSignalCount,
    cleanSignalCount: ctx.cleanSignalCount,
    emailStatus,
    emailMessageId,
  });

  if (!storage.saved) {
    const error = storage.error || "Storage failed";
    if (source === "daily") console.error("[DAILY_REPORT] latest dashboard report save failed error=" + error);
    if (source === "manual") console.error("[GENERATE_REPORT] latest report save failed error=" + error);
    throw new Error(error);
  }

  if (source === "daily") console.info("[DAILY_REPORT] latest dashboard report saved");
  if (source === "manual") console.info("[GENERATE_REPORT] latest report saved");

  if (sendEmail) {
    if (emailStatus === "sent") console.info("[DAILY_REPORT] email sent");
    else console.info("[DAILY_REPORT] email failed but dashboard saved");
  }

  return {
    ok: true,
    generatedAt,
    report,
    dashboardReport: normalizeDashboardReport({ report })!,
    storage,
    emailStatus,
    emailMessageId,
    triageUsed: report.triageUsed === true || report.aiTriageUsed === true,
    gmailIntelDiagnostics: report.gmailIntelDiagnostics,
  };
}
