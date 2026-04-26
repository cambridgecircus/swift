import type { AIReportContract, CleanMarketSignal } from "@/lib/types";

export type KeySignal = {
  title: string;
  source: string;
  implication: string;
};

export type IntelligenceReport = {
  generatedAt: string;
  headline: string;
  executiveSummary: string;
  keySignals: KeySignal[];
  hrbpRecommendations: string[];
};

function mapAIReportContractToIntelligenceReport(
  contract: AIReportContract,
  generatedAt: string,
): IntelligenceReport {
  const headlines = contract.marketBriefs.map((b) => b.headline).filter(Boolean);
  const headline =
    headlines.length <= 1
      ? (headlines[0] ?? "SWIFT intelligence summary")
      : headlines.slice(0, 2).join(" · ");

  const keySignals: KeySignal[] = [];
  for (const brief of contract.marketBriefs) {
    for (const s of brief.keySignals) {
      keySignals.push({
        title: s.title,
        source: s.sourceName,
        implication: s.hrbpImplication,
      });
    }
  }

  const hrbpRecommendations: string[] = [];
  for (const brief of contract.marketBriefs) {
    for (const s of brief.keySignals) {
      if (s.recommendedAction && !hrbpRecommendations.includes(s.recommendedAction)) {
        hrbpRecommendations.push(s.recommendedAction);
      }
    }
  }
  for (const sk of contract.skillsToPickUp) {
    if (sk.nextAction && !hrbpRecommendations.includes(sk.nextAction)) {
      hrbpRecommendations.push(sk.nextAction);
    }
  }

  if (hrbpRecommendations.length === 0) {
    hrbpRecommendations.push(
      "Turn the executive summary into a short decision memo: what changes, what stays, what to monitor.",
    );
  }

  return {
    generatedAt,
    headline,
    executiveSummary: contract.executiveSummary,
    keySignals: keySignals.length > 0 ? keySignals.slice(0, 10) : keySignals,
    hrbpRecommendations: hrbpRecommendations.slice(0, 8),
  };
}

function buildRulesBasedReport(
  cleanedSignals: CleanMarketSignal[],
  generatedAt: string,
): IntelligenceReport {
  const topSignals = cleanedSignals.slice(0, 5);

  const tagCounts = new Map<string, number>();
  for (const s of topSignals) {
    for (const t of s.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }

  const dominantTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);

  const keySignals: KeySignal[] = topSignals.map((s) => ({
    title: s.title,
    source: s.sourceName,
    implication: s.hrbpImplication,
  }));

  const recommendations: string[] = [
    dominantTags.includes("AI")
      ? "Identify which roles need AI literacy and which workflows can be augmented."
      : "Translate the top market signals into 1–2 operating model decisions for leaders this week.",
    dominantTags.includes("Regulation") || dominantTags.includes("Compliance")
      ? "Pressure-test workforce plans for compliance, risk, legal, and institutional capability needs."
      : "Review capability gaps against current hiring plans and prioritise critical roles.",
    dominantTags.includes("Hiring") || dominantTags.includes("Talent")
      ? "Compare hiring signals against retention risk and internal mobility opportunities."
      : "Turn signals into a short decision memo: what changes, what stays the same, what to monitor.",
    "Rules-based baseline (DeepSeek unavailable or returned no valid JSON).",
  ];

  return {
    generatedAt,
    headline: `Live RSS signals detected (${cleanedSignals.length}) — top themes: ${dominantTags.join(
      ", ",
    )}`,
    executiveSummary: `This report ingested ${cleanedSignals.length} cleaned RSS signals and selected the top ${topSignals.length} by relevance score. Dominant tags: ${dominantTags.join(
      ", ",
    )}. This is a deterministic, rules-based summary (keyword scoring + deduplication).`,
    keySignals,
    hrbpRecommendations: recommendations,
  };
}

export async function generateReport(): Promise<IntelligenceReport> {
  const { getCleanedMarketSignals } = await import("@/lib/rssIngestion");
  const { shouldUseDeepSeek, generateDeepSeekReport } = await import("@/lib/deepseekClient");

  const cleanedSignals = await getCleanedMarketSignals();
  const generatedAt = new Date().toISOString();

  if (cleanedSignals.length > 0) {
    if (shouldUseDeepSeek()) {
      const aiContract = await generateDeepSeekReport({
        cleanedSignals,
        generatedAt,
      });
      if (aiContract) {
        return mapAIReportContractToIntelligenceReport(aiContract, generatedAt);
      }
    }

    return buildRulesBasedReport(cleanedSignals, generatedAt);
  }

  const mockSignals: KeySignal[] = [
    {
      title: "AI-native operating models are moving from experiment to execution",
      source: "Mock signal",
      implication:
        "HRBPs need to help leaders define what work should be automated, augmented, or kept human-led.",
    },
    {
      title: "Web3 companies are prioritising compliance-ready growth",
      source: "Mock signal",
      implication:
        "People teams need stronger workforce planning around regulatory, risk, legal, and institutional client capability.",
    },
    {
      title: "Lean teams are replacing broad hiring with sharper capability bets",
      source: "Mock signal",
      implication:
        "HRBPs can add value by mapping critical roles, productivity blockers, and leadership decision quality.",
    },
  ];

  return {
    generatedAt,
    headline:
      "Web3 x AI hiring is shifting from hype-driven expansion to operator-led execution.",
    executiveSummary:
      "The strongest signal is that AI and Web3 companies are becoming more selective. Instead of hiring broadly, leadership teams are looking for people who can combine domain judgment, automation literacy, compliance awareness, and commercial execution. For HRBPs, this creates an opportunity to move beyond process support and become a sharper business operator.",
    keySignals: mockSignals,
    hrbpRecommendations: [
      "Build a critical capability map for AI, compliance, product, and growth roles.",
      "Help leaders separate work that can be automated from work requiring judgment, trust, and stakeholder navigation.",
      "Use market intelligence to challenge hiring plans, not just fulfil them.",
      "Turn fragmented external signals into practical org design and workforce planning recommendations.",
    ],
  };
}
