import { getLiveJobOpportunities } from "@/lib/jobIngestion";
import {
  fetchRecentImportedJobAlerts,
  importedAlertToJobRecord,
} from "@/lib/linkedinJobAlertIngestion";
import { getCleanedMarketSignals, getRssSourceHealth } from "@/lib/rssIngestion";

/**
 * Collects optional context for persisting a run (signals, jobs, source health).
 * Best-effort: individual fetches do not throw to the caller.
 */
export async function gatherReportStorageContext(): Promise<{
  marketSignals: Record<string, unknown>[];
  rawSignalCount: number;
  cleanSignalCount: number;
  jobOpportunities: Record<string, unknown>[];
  sourceHealth: Record<string, unknown>[];
}> {
  let marketSignals: Record<string, unknown>[] = [];
  let rssHealth: Record<string, unknown>[] = [];
  let jobOpportunities: Record<string, unknown>[] = [];
  let jobSourceHealth: Record<string, unknown>[] = [];

  try {
    const signals = await getCleanedMarketSignals();
    marketSignals = signals.map((s) => ({ ...s }));
  } catch {
    /* optional */
  }

  try {
    const health = await getRssSourceHealth();
    rssHealth = health.map((h) => ({
      sourceName: h.sourceName,
      status: h.status,
      itemCount: h.itemCount,
      errorMessage: h.errorMessage,
      checkedAt: h.checkedAt,
    }));
  } catch {
    /* optional */
  }

  try {
    const live = await getLiveJobOpportunities();
    jobOpportunities = live.opportunities.map((j) => ({ ...j }));
    jobSourceHealth = live.sourceHealth.map((h) => ({ ...h }));
  } catch {
    /* optional */
  }

  try {
    const imported = await fetchRecentImportedJobAlerts(80);
    const merged = imported.map(importedAlertToJobRecord);
    const seen = new Set(
      jobOpportunities.map(
        (j) =>
          `${String(j.role ?? "").toLowerCase()}|${String(j.company ?? "").toLowerCase()}|${String(j.applyUrl ?? "").toLowerCase()}`,
      ),
    );
    for (const row of merged) {
      const key = `${String(row.role ?? "").toLowerCase()}|${String(row.company ?? "").toLowerCase()}|${String(row.applyUrl ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobOpportunities.push(row);
    }
  } catch {
    /* optional */
  }

  const n = marketSignals.length;
  const sourceHealth = [...rssHealth, ...jobSourceHealth];

  return {
    marketSignals,
    rawSignalCount: n,
    cleanSignalCount: n,
    jobOpportunities,
    sourceHealth,
  };
}
