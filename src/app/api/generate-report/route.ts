import { generateReport } from "@/lib/generateReport";
import { saveIntelligenceRun } from "@/lib/intelligenceStorage";
import { gatherReportStorageContext } from "@/lib/reportStorageContext";
import { getSourceRegistrySummary } from "@/lib/sourceRegistrySummary";

export async function POST() {
  const report = await generateReport();

  let storage: { saved: boolean; runId?: string; error?: string } = {
    saved: false,
    error: "Not attempted",
  };

  try {
    const ctx = await gatherReportStorageContext();
    const sourceRegistrySummary = getSourceRegistrySummary();
    storage = await saveIntelligenceRun({
      runType: "manual",
      report: { ...report } as unknown as Record<string, unknown>,
      marketSignals: ctx.marketSignals,
      jobOpportunities: ctx.jobOpportunities,
      sourceHealth: ctx.sourceHealth,
      sourceRegistrySummary: sourceRegistrySummary as unknown as Record<string, unknown>,
      rawSignalCount: ctx.rawSignalCount,
      cleanSignalCount: ctx.cleanSignalCount,
    });
  } catch {
    storage = { saved: false, error: "Storage failed" };
  }

  return Response.json({ ...report, storage });
}
