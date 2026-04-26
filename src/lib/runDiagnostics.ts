/** Snapshot of ingestion + persistence for dashboard diagnostics (manual / scheduled runs). */
export type RunDiagnostics = {
  generatedAt: string;
  runType: "scheduled" | "manual";
  /** When RSS + job + LinkedIn context gather finished (before AI). */
  ingestionCompletedAt: string;
  rawSignalCount: number;
  cleanSignalCount: number;
  liveJobCount: number;
  importedLinkedInJobCount: number;
  sourceHealthRowCount: number;
  emailStatus: string;
  runId?: string;
  storageSaved: boolean;
  /** From curated source registry (not RSS row count). */
  registryTotalSources?: number;
  registryEnabledSources?: number;
};

/** Fingerprint for “counts unchanged” notice (stable news/jobs surface). */
export function runDiagnosticsFingerprint(d: RunDiagnostics): string {
  return [
    d.rawSignalCount,
    d.cleanSignalCount,
    d.liveJobCount,
    d.importedLinkedInJobCount,
    d.sourceHealthRowCount,
  ].join("|");
}
