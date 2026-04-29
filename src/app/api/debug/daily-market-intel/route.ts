import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { fetchDailyMarketIntelEmails, type DailyMarketIntelSection } from "@/lib/gmailDailyMarketIntel";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchDailyMarketIntelEmails().catch(() => ({
    generatedAt: new Date().toISOString(),
    emails: [],
  }));

  const sections: DailyMarketIntelSection[] = [
    "ai_market",
    "web3_market",
    "hrbp_leadership",
    "employment_law",
    "expansion_downsizing",
  ];

  const sectionCounts: Record<DailyMarketIntelSection, number> = {
    ai_market: 0,
    web3_market: 0,
    hrbp_leadership: 0,
    employment_law: 0,
    expansion_downsizing: 0,
  };

  let totalItems = 0;
  for (const e of result.emails ?? []) {
    for (const s of sections) {
      const n = e.sections?.[s]?.length ?? 0;
      sectionCounts[s] += n;
      totalItems += n;
    }
  }

  return jsonResponseNoStore({
    ok: true,
    generatedAt: result.generatedAt,
    emailCount: result.emails?.length ?? 0,
    totalItems,
    sectionCounts,
    emails: result.emails,
  });
}

