import { getRssSources } from "@/lib/sourceRegistry";
import { cleanMarketSignals, fetchRssSources, getRssSourceHealth } from "@/lib/rssIngestion";

export async function GET() {
  const enabledRssSources = getRssSources()
    .filter((s) => s.enabled)
    .map((s) => ({ id: s.id, name: s.name, url: s.url, category: s.category }));

  const raw = await fetchRssSources();
  const cleaned = cleanMarketSignals(raw);
  const sourceHealthAll = await getRssSourceHealth();
  const sourceHealth = sourceHealthAll.filter((s) =>
    enabledRssSources.some((e) => e.id === s.sourceId),
  );

  return Response.json({
    status: "ok",
    rawCount: raw.length,
    cleanedCount: cleaned.length,
    enabledRssSources,
    sourceHealth,
    topSignals: cleaned.slice(0, 10),
  });
}

