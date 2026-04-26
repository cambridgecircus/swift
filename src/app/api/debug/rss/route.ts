import { getRssSources } from "@/lib/sourceRegistry";
import { cleanMarketSignals, fetchRssSources } from "@/lib/rssIngestion";

export async function GET() {
  const enabledRssSources = getRssSources()
    .filter((s) => s.enabled)
    .map((s) => ({ id: s.id, name: s.name, url: s.url, category: s.category }));

  const raw = await fetchRssSources();
  const cleaned = cleanMarketSignals(raw);

  return Response.json({
    status: "ok",
    rawCount: raw.length,
    cleanedCount: cleaned.length,
    enabledRssSources,
    topSignals: cleaned.slice(0, 10),
  });
}

