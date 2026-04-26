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

export async function generateReport(): Promise<IntelligenceReport> {
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
    generatedAt: new Date().toISOString(),
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
