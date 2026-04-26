import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getLiveJobOpportunities } from "@/lib/jobIngestion";
import {
  fetchRecentImportedJobAlerts,
  importedAlertToCleanOpportunity,
  importedAlertToJobRecord,
} from "@/lib/linkedinJobAlertIngestion";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getLiveJobOpportunities();
  let importedLinkedIn: Record<string, unknown>[] = [];
  try {
    const rows = await fetchRecentImportedJobAlerts(50);
    importedLinkedIn = rows.map((r) => importedAlertToJobRecord(r));
    const linkedOpps = rows.map(importedAlertToCleanOpportunity);
    const seenApply = new Set(data.opportunities.map((o) => o.applyUrl.toLowerCase()));
    const merged = [...data.opportunities];
    for (const o of linkedOpps) {
      const k = o.applyUrl.toLowerCase();
      if (!k || seenApply.has(k)) continue;
      seenApply.add(k);
      merged.push(o);
    }
    merged.sort((a, b) => b.fitScore - a.fitScore || a.role.localeCompare(b.role));
    return jsonResponseNoStore({ ...data, opportunities: merged, importedLinkedIn });
  } catch {
    importedLinkedIn = [];
  }
  return jsonResponseNoStore({ ...data, importedLinkedIn });
}
