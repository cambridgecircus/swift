import { generateReport } from "@/lib/generateReport";
import {
  buildCappedWeeklyLiveJobsList,
  mapCtxJobRecordToWeeklyLiveJob,
  saveIntelligenceRun,
  type WeeklySummaryLiveJob,
} from "@/lib/intelligenceStorage";
import { gatherReportStorageContext } from "@/lib/reportStorageContext";
import type { RunDiagnostics } from "@/lib/runDiagnostics";
import { sendReportEmail } from "@/lib/sendReportEmail";
import { getSourceRegistrySummary } from "@/lib/sourceRegistrySummary";

export type { RunDiagnostics } from "@/lib/runDiagnostics";
export { runDiagnosticsFingerprint } from "@/lib/runDiagnostics";

function extractEmailMeta(emailResult: unknown): {
  emailStatus: string;
  emailMessageId?: string;
} {
  if (!emailResult || typeof emailResult !== "object") {
    return { emailStatus: "unknown" };
  }
  const r = emailResult as { data?: { id?: string }; error?: unknown };
  if (r.error) {
    return { emailStatus: "failed" };
  }
  const id = r.data?.id;
  return {
    emailStatus: "sent",
    emailMessageId: typeof id === "string" ? id : undefined,
  };
}

function countImportedLinkedInJobs(jobOpportunities: Record<string, unknown>[]): number {
  return jobOpportunities.filter(
    (j) =>
      String(j.source ?? "") === "LinkedIn Job Alert" ||
      String(j.id ?? "").startsWith("linkedin-import-"),
  ).length;
}

export async function runReportAndSendEmail(input: {
  runType: "scheduled" | "manual";
}): Promise<{
  status: "ok" | "error";
  message: string;
  report?: unknown;
  emailResult?: unknown;
  storage?: { saved: boolean; runId?: string; error?: string };
  liveJobs?: WeeklySummaryLiveJob[];
  liveJobsTotalDeduped?: number;
  liveJobsHasMore?: boolean;
  diagnostics?: RunDiagnostics;
}> {
  try {
    console.info(`[report_runner] run started runType=${input.runType}`);
    const ctx = await gatherReportStorageContext();
    const ingestionCompletedAt = new Date().toISOString();
    console.info(
      "[report_runner] collected storage context",
      JSON.stringify({
        rawSignalCount: ctx.rawSignalCount,
        cleanSignalCount: ctx.cleanSignalCount,
        marketSignals: ctx.marketSignals.length,
        jobOpportunities: ctx.jobOpportunities.length,
        sourceHealth: ctx.sourceHealth.length,
      }),
    );

    const report = await generateReport({ storageContext: ctx });
    const emailResult = await sendReportEmail(report);
    const { emailStatus, emailMessageId } = extractEmailMeta(emailResult);

    let storage: { saved: boolean; runId?: string; error?: string } = {
      saved: false,
      error: "Not attempted",
    };

    let liveJobs: WeeklySummaryLiveJob[] = [];
    let liveJobsTotalDeduped = 0;
    let liveJobsHasMore = false;

    const sourceRegistrySummary = getSourceRegistrySummary();

    try {
      const mapped = ctx.jobOpportunities.map((x) =>
        mapCtxJobRecordToWeeklyLiveJob(x as Record<string, unknown>),
      );
      const capped = buildCappedWeeklyLiveJobsList(mapped);
      liveJobs = capped.liveJobs;
      liveJobsTotalDeduped = capped.liveJobsTotalDeduped;
      liveJobsHasMore = capped.liveJobsHasMore;

      storage = await saveIntelligenceRun({
        runType: input.runType,
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
    } catch {
      storage = { saved: false, error: "Storage failed" };
    }

    const importedLinkedInJobCount = countImportedLinkedInJobs(ctx.jobOpportunities);

    const diagnostics: RunDiagnostics = {
      generatedAt: report.generatedAt,
      runType: input.runType,
      ingestionCompletedAt,
      rawSignalCount: ctx.rawSignalCount,
      cleanSignalCount: ctx.cleanSignalCount,
      liveJobCount: ctx.jobOpportunities.length,
      importedLinkedInJobCount,
      sourceHealthRowCount: ctx.sourceHealth.length,
      emailStatus,
      runId: storage.runId,
      storageSaved: Boolean(storage.saved),
      registryTotalSources: sourceRegistrySummary.totalSources,
      registryEnabledSources: sourceRegistrySummary.enabledSources,
    };

    return {
      status: "ok",
      message: "Report generated and email sent successfully.",
      report,
      emailResult,
      storage,
      liveJobs,
      liveJobsTotalDeduped,
      liveJobsHasMore,
      diagnostics,
    };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
