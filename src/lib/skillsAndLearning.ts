import { mockLearningAssets, mockSkills } from "@/lib/mockData";
import { getWeeklySummary } from "@/lib/intelligenceStorage";
import { getSupabaseAdmin, isSupabaseStorageConfigured } from "@/lib/supabaseServer";
import {
  FRAMEWORK_LIBRARY_LABEL,
  getFrameworkById,
  managementFrameworks,
  type CuratedManagementFramework,
  type FrameworkField,
} from "@/lib/managementFrameworks";

export type LiveSkillPriority = "High" | "Medium" | "Low";
export type LiveAssetStatus = "Planned" | "In Progress" | "Applied" | "Archived";

export type LiveSkillToPickUp = {
  id: string;
  title: string;
  category:
    | "AI / Automation"
    | "Web3 / Crypto"
    | "HRBP Strategic"
    | "Commercial / Product"
    | "Data / Analytics"
    | "Executive Communication";
  priority: LiveSkillPriority;
  priorityScore: number;
  currentStatus: LiveAssetStatus;
  scoringBreakdown: {
    marketTrendFrequency: number;
    signalStrength: number;
    jobRelevance: number;
    hrbpStrategicLeverage: number;
    portfolioInterviewValue: number;
  };
  whyItMatters: string;
  evidenceSignals: string[];
  suggestedAction: string;
  relatedTopics: string[];
};

export type LiveLearningAssetFormat =
  | "One-pager"
  | "Training deck"
  | "Interview story"
  | "Dashboard idea"
  | "Case study"
  | "Prompt library"
  | "Market map"
  | "Playbook";

export type LiveLearningAsset = {
  id: string;
  title: string;
  format: LiveLearningAssetFormat;
  priority: LiveSkillPriority;
  priorityScore: number;
  status: LiveAssetStatus;
  scoringBreakdown: {
    linkedSkillPriority: number;
    marketDemandEvidence: number;
    reusableCareerValue: number;
    theoryPracticeFoundation: number;
    outputClarity: number;
  };
  whyNow: string;
  intendedOutput: string;
  outline: string[];
  linkedSkills: string[];
  sourceEvidence: string[];
  theoryPracticeFoundation: {
    frameworkName: string;
    field: FrameworkField;
    howItSupportsTheAsset: string;
  }[];
};

export type LiveSkillsAndLearningResult = {
  status: "ok" | "fallback" | "error";
  generatedAt: string;
  source: "repo_weekly_summary" | "fallback_mock";
  priorityLogic: {
    skillsPriorityFormula: string[];
    learningAssetPriorityFormula: string[];
    thresholds: {
      high: string;
      medium: string;
      low: string;
    };
  };
  skills: LiveSkillToPickUp[];
  learningAssets: LiveLearningAsset[];
  error?: string;
};

const PRIORITY_LOGIC: LiveSkillsAndLearningResult["priorityLogic"] = {
  skillsPriorityFormula: [
    "marketTrendFrequency (0–25): weighted hits from weekly topThemes + repeated keyword matches across run headlines, executive summaries, and report_json (headline, executiveSummary, keySignals, hrbpRecommendations).",
    "signalStrength (0–20): Strong keySignals and relevance scores in report_json; topThemes breadth; clean vs raw signal density across runs (conservative when fields missing).",
    "jobRelevance (0–20): swift_job_opportunities rows in the same run window matched to skill keywords (role, gaps, why_this_fits, recommended_action).",
    "hrbpStrategicLeverage (0–20): fixed tier per capability (workforce planning, operating model, AI workflow, analytics, compliance-ready strategy) plus theme alignment.",
    "portfolioInterviewValue (0–15): clarity as interview story, case study, playbook, dashboard, or training output from skill profile + evidence density.",
    "Total 0–100. Priority: High ≥80, Medium 55–79, Low <55.",
  ],
  learningAssetPriorityFormula: [
    "linkedSkillPriority (0–30): proportional to highest linked skill priorityScore.",
    "marketDemandEvidence (0–20): weekly themes, suggested actions, and signal/job density in the window.",
    "reusableCareerValue (0–20): portfolio, interview, networking, and exec-conversation utility of the output format.",
    "theoryPracticeFoundation (0–15): at least one curated internal framework mapped to the asset (no live web search).",
    "outputClarity (0–15): how concretely the deliverable can be drafted as one-pager, deck, case study, playbook, prompt library, market map, or dashboard spec.",
    "Total 0–100. Same High / Medium / Low thresholds as skills.",
  ],
  thresholds: {
    high: "Score ≥ 80 → High priority",
    medium: "Score ≥ 55 and < 80 → Medium priority",
    low: "Score < 55 → Low priority",
  },
};

type SkillDef = {
  id: string;
  title: string;
  category: LiveSkillToPickUp["category"];
  /** Match weekly theme names (case-insensitive substring) */
  themeHints: string[];
  /** Regexes against run + job corpus */
  patterns: RegExp[];
  leverageTier: 1 | 2 | 3 | 4; // higher → more HRBP operator leverage (maps to points)
  portfolioTier: 1 | 2 | 3;
  whyTemplate: string;
  actionTemplate: string;
  relatedTopics: string[];
};

const SKILL_DEFS: SkillDef[] = [
  {
    id: "skill_ai_literacy_workflow",
    title: "AI literacy and workflow redesign for HRBPs",
    category: "AI / Automation",
    themeHints: ["AI"],
    patterns: [/\bai\b/i, /artificial intelligence/i, /workflow/i, /automation/i, /agentic/i],
    leverageTier: 4,
    portfolioTier: 3,
    whyTemplate:
      "SWIFT signals tie AI adoption to operating rhythm and decision quality—not tooling alone.",
    actionTemplate:
      "Map three HRBP workflows (intake, talent review, ER triage) and mark automate / augment / human-led with owners.",
    relatedTopics: ["Operating model", "Manager enablement", "People analytics handoffs"],
  },
  {
    id: "skill_compliance_people_model",
    title: "Compliance-ready People Operating Model",
    category: "HRBP Strategic",
    themeHints: ["compliance", "regulation"],
    patterns: [/compliance/i, /regulation/i, /regulatory/i, /risk posture/i, /governance/i],
    leverageTier: 4,
    portfolioTier: 3,
    whyTemplate:
      "Regulatory and risk signals increasingly shape hiring and org structure in Web3 and AI operators.",
    actionTemplate:
      "Draft a one-page compliance-ready workforce narrative: critical roles, controls, and HRBP checkpoints.",
    relatedTopics: ["ER risk", "Policy cadence", "Leadership alignment"],
  },
  {
    id: "skill_strategic_workforce_web3",
    title: "Strategic Workforce Planning for Web3 growth",
    category: "HRBP Strategic",
    themeHints: ["hiring", "talent", "workforce planning", "Web3", "crypto"],
    patterns: [/workforce/i, /headcount/i, /role criticality/i, /talent/i, /hiring/i, /web3/i, /crypto/i],
    leverageTier: 4,
    portfolioTier: 2,
    whyTemplate:
      "Live roles and market language emphasise lean teams, capability bets, and selective hiring.",
    actionTemplate:
      "Build a 90-day workforce plan: critical roles, upskill vs hire, and sunset roles tied to runway.",
    relatedTopics: ["Capability map", "Comp narrative", "Location strategy"],
  },
  {
    id: "skill_people_analytics_exec",
    title: "People Analytics into executive decision-making",
    category: "Data / Analytics",
    themeHints: ["analytics"],
    patterns: [/analytics/i, /metrics/i, /dashboard/i, /attrition/i, /productivity/i],
    leverageTier: 4,
    portfolioTier: 3,
    whyTemplate:
      "Signals ask for fewer dashboards and more decisions—analytics must land in exec-ready actions.",
    actionTemplate:
      "Pick five leading indicators with a weekly decision rule for each (who decides, by when).",
    relatedTopics: ["OKRs", "Talent review", "Finance partnership"],
  },
  {
    id: "skill_manager_effectiveness_ai",
    title: "Manager effectiveness in AI-native teams",
    category: "Executive Communication",
    themeHints: ["leadership", "skills"],
    patterns: [/manager/i, /leadership/i, /coaching/i, /performance cadence/i, /cadence/i],
    leverageTier: 3,
    portfolioTier: 3,
    whyTemplate:
      "Shorter signal-driven performance loops and AI tools shift what managers must do weekly.",
    actionTemplate:
      "Define a manager operating system: six rituals with inputs, outputs, and HRBP support hooks.",
    relatedTopics: ["Change narrative", "Situational leadership", "Feedback"],
  },
  {
    id: "skill_web3_domain_fluency",
    title: "Web3 domain fluency for HRBP decision partnering",
    category: "Web3 / Crypto",
    themeHints: ["Web3", "crypto", "blockchain"],
    patterns: [/web3/i, /crypto/i, /blockchain/i, /defi/i, /token/i],
    leverageTier: 3,
    portfolioTier: 3,
    whyTemplate:
      "Job and signal corpus rewards HRBPs who can translate domain context into credible people plans.",
    actionTemplate:
      "Create a 20-term glossary + three exec questions you can answer cold on market and org risks.",
    relatedTopics: ["Talent market map", "Comp philosophy", "Regulatory lens"],
  },
  {
    id: "skill_talent_market_intel",
    title: "Talent market intelligence and competitor mapping",
    category: "Commercial / Product",
    themeHints: ["hiring", "talent"],
    patterns: [/competitor/i, /mapping/i, /market map/i, /talent market/i, /sourcing/i],
    leverageTier: 3,
    portfolioTier: 3,
    whyTemplate:
      "Repeated companies and role patterns in stored jobs imply comparative talent intelligence is a lever.",
    actionTemplate:
      "Pick three peer operators and document role families, comp posture, and hiring velocity from public signals.",
    relatedTopics: ["Benchmarking", "EVP", "Location"],
  },
  {
    id: "skill_operating_model_lean_crypto",
    title: "Operating model design for lean crypto teams",
    category: "HRBP Strategic",
    themeHints: ["operating model", "AI", "leadership"],
    patterns: [/operating model/i, /decision rights/i, /lean/i, /org design/i],
    leverageTier: 4,
    portfolioTier: 2,
    whyTemplate:
      "Themes across runs point to execution discipline, role criticality, and operating redesign over hype.",
    actionTemplate:
      "Use a 7S-style pass: list misalignments between strategy, structure, and systems for your team.",
    relatedTopics: ["Work decomposition", "AI adoption", "Governance"],
  },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function extractReportBlob(report: unknown): string {
  if (!report || typeof report !== "object") return "";
  const r = report as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.headline === "string") parts.push(r.headline);
  if (typeof r.executiveSummary === "string") parts.push(r.executiveSummary);
  const ks = r.keySignals;
  if (Array.isArray(ks)) {
    for (const item of ks) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        for (const k of ["title", "source", "implication", "sourceName", "summary", "whyItMatters", "hrbpImplication"]) {
          if (typeof o[k] === "string") parts.push(o[k] as string);
        }
        const st = o.signalStrength ?? o.signal_strength;
        if (typeof st === "string") parts.push(`strength:${st}`);
        const rel = typeof o.relevanceScore === "number" ? o.relevanceScore : o.relevance_score;
        if (typeof rel === "number") parts.push(`relevance:${rel}`);
      }
    }
  }
  const hr = r.hrbpRecommendations;
  if (Array.isArray(hr)) {
    for (const x of hr) {
      if (typeof x === "string") parts.push(x);
    }
  }
  return parts.join("\n");
}

function collectRunCorpus(runs: Record<string, unknown>[]): string {
  const chunks: string[] = [];
  for (const run of runs) {
    const h = typeof run.headline === "string" ? run.headline : "";
    const e = typeof run.executive_summary === "string" ? run.executive_summary : "";
    chunks.push(h, e, extractReportBlob(run.report_json));
  }
  return chunks.join("\n");
}

function countPatternHits(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    const flags = p.flags.includes("g") ? p.flags : `${p.flags}g`;
    const m = text.match(new RegExp(p.source, flags));
    if (m) n += m.length;
  }
  return n;
}

function strongSignalStats(runs: Record<string, unknown>[]): { strong: number; relevanceSum: number; nSignals: number } {
  let strong = 0;
  let relevanceSum = 0;
  let nSignals = 0;
  for (const run of runs) {
    const report = run.report_json;
    if (!report || typeof report !== "object") continue;
    const r = report as Record<string, unknown>;
    const ks = r.keySignals;
    if (!Array.isArray(ks)) continue;
    for (const item of ks) {
      if (!item || typeof item !== "object") continue;
      nSignals++;
      const o = item as Record<string, unknown>;
      const st = o.signalStrength ?? o.signal_strength;
      if (typeof st === "string" && st.toLowerCase() === "strong") strong++;
      const rel = typeof o.relevanceScore === "number" ? o.relevanceScore : o.relevance_score;
      if (typeof rel === "number") relevanceSum += rel;
    }
  }
  return { strong, relevanceSum, nSignals };
}

function themeMatchScore(def: SkillDef, topThemes: { theme: string; count: number }[]): number {
  let pts = 0;
  for (const t of topThemes) {
    const tl = t.theme.toLowerCase();
    for (const hint of def.themeHints) {
      if (tl.includes(hint.toLowerCase()) || hint.toLowerCase().includes(tl)) {
        pts += Math.min(8, 2 + t.count * 2);
      }
    }
  }
  return pts;
}

function collectJobCorpus(jobs: Record<string, unknown>[]): string {
  const rows: string[] = [];
  for (const j of jobs) {
    rows.push(
      [j.role, j.company, j.why_this_fits, j.recommended_action, j.gaps]
        .filter((x): x is string => typeof x === "string")
        .join(" "),
    );
  }
  return rows.join("\n");
}

function parseGapsField(gaps: unknown): string {
  if (typeof gaps === "string") return gaps;
  if (Array.isArray(gaps)) return gaps.filter((x): x is string => typeof x === "string").join(" ");
  return "";
}

function jobRowsForEvidence(jobs: Record<string, unknown>[], def: SkillDef): string[] {
  const out: string[] = [];
  for (const j of jobs) {
    const blob = [
      j.role,
      j.company,
      j.why_this_fits,
      j.recommended_action,
      parseGapsField(j.gaps),
    ]
      .filter((x): x is string => typeof x === "string")
      .join(" ");
    if (!blob.trim()) continue;
    let hit = false;
    for (const p of def.patterns) {
      if (p.test(blob)) {
        hit = true;
        break;
      }
    }
    for (const h of def.themeHints) {
      if (blob.toLowerCase().includes(h.toLowerCase())) hit = true;
    }
    if (hit) {
      const label = `${String(j.company ?? "Company")}: ${String(j.role ?? "Role")}`;
      out.push(label);
    }
  }
  return [...new Set(out)].slice(0, 5);
}

function scoreSkill(
  def: SkillDef,
  ctx: {
    runCorpus: string;
    jobCorpus: string;
    jobs: Record<string, unknown>[];
    topThemes: { theme: string; count: number }[];
    totalClean: number;
    totalRaw: number;
    runCount: number;
    ss: { strong: number; relevanceSum: number; nSignals: number };
  },
): { breakdown: LiveSkillToPickUp["scoringBreakdown"]; evidenceSignals: string[]; hasEvidence: boolean } {
  const themePts = themeMatchScore(def, ctx.topThemes);
  const runHits = countPatternHits(ctx.runCorpus, def.patterns);
  const runThemeBonus = Math.min(10, runHits * 2);
  const marketTrendFrequency = clamp(Math.round(themePts + runThemeBonus), 0, 25);

  const density =
    ctx.runCount > 0 ? clamp((ctx.totalClean / ctx.runCount / 25) * 10, 0, 8) : 0;
  const strongPts = clamp(ctx.ss.strong * 4, 0, 12);
  const relPts =
    ctx.ss.nSignals > 0 ? clamp((ctx.ss.relevanceSum / ctx.ss.nSignals / 100) * 8, 0, 8) : 0;
  const breadth = clamp(ctx.topThemes.length * 2, 0, 6);
  const signalStrength = clamp(Math.round(strongPts + relPts + breadth + density), 0, 20);

  const jobHits = countPatternHits(ctx.jobCorpus, def.patterns);
  const jobMatches = jobRowsForEvidence(ctx.jobs, def);
  const jobRelevance = clamp(Math.round(jobHits * 5 + jobMatches.length * 3), 0, 20);

  const hrbpStrategicLeverage = clamp(4 + def.leverageTier * 4 + Math.min(4, themePts / 4), 0, 20);

  const portfolioInterviewValue = clamp(
    3 + def.portfolioTier * 3 + Math.min(6, (runHits + jobHits) / 2),
    0,
    15,
  );

  const evidenceSignals: string[] = [];
  if (themePts > 0) evidenceSignals.push(`Weekly themes align (${def.themeHints.slice(0, 3).join(", ")})`);
  if (runHits > 0) evidenceSignals.push(`${runHits} keyword matches across stored report text`);
  if (jobMatches.length > 0) evidenceSignals.push(`Live stored jobs: ${jobMatches.slice(0, 2).join("; ")}`);
  if (ctx.ss.strong > 0) evidenceSignals.push(`${ctx.ss.strong} Strong signal(s) in report_json keySignals`);
  if (evidenceSignals.length === 0 && ctx.topThemes.length > 0) {
    evidenceSignals.push(`Corpus: ${ctx.topThemes[0]?.theme ?? "signals"} trending in-window`);
  }

  const hasEvidence =
    marketTrendFrequency > 0 ||
    signalStrength > 0 ||
    jobRelevance > 0 ||
    themePts > 0 ||
    runHits > 0 ||
    jobMatches.length > 0;

  return {
    breakdown: {
      marketTrendFrequency,
      signalStrength,
      jobRelevance,
      hrbpStrategicLeverage,
      portfolioInterviewValue,
    },
    evidenceSignals: evidenceSignals.slice(0, 8),
    hasEvidence,
  };
}

function priorityFromScore(score: number): LiveSkillPriority {
  if (score >= 80) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function totalSkillScore(b: LiveSkillToPickUp["scoringBreakdown"]): number {
  return (
    b.marketTrendFrequency +
    b.signalStrength +
    b.jobRelevance +
    b.hrbpStrategicLeverage +
    b.portfolioInterviewValue
  );
}

async function loadJobsForRuns(runIds: string[]): Promise<Record<string, unknown>[]> {
  if (!isSupabaseStorageConfigured() || runIds.length === 0) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("swift_job_opportunities")
    .select("*")
    .in("run_id", runIds.slice(0, 40));
  if (error || !data) return [];
  return data as Record<string, unknown>[];
}

function frameworkRef(
  fw: CuratedManagementFramework,
  how: string,
): LiveLearningAsset["theoryPracticeFoundation"][0] {
  return {
    frameworkName: fw.name,
    field: fw.field,
    howItSupportsTheAsset: how,
  };
}

type AssetTemplate = {
  id: string;
  title: string;
  format: LiveLearningAssetFormat;
  linkedSkillIds: string[];
  intendedOutput: string;
  outline: string[];
  frameworkIds: string[];
  frameworkHow: string[];
  whyPrefix: string;
};

const ASSET_TEMPLATES: AssetTemplate[] = [
  {
    id: "asset_people_strategy_ai_web3",
    title: "People Strategy for AI-native Web3 Teams",
    format: "One-pager",
    linkedSkillIds: ["skill_ai_literacy_workflow", "skill_web3_domain_fluency", "skill_operating_model_lean_crypto"],
    intendedOutput:
      "Single-page people strategy: context, bets, org implications, and HRBP actions for the next 90 days.",
    outline: [
      "Operating context (AI + Web3 constraints)",
      "People bets (3) tied to business outcomes",
      "Workforce / capability implications",
      "HRBP decision cadence and metrics",
    ],
    frameworkIds: ["mckinsey_7s", "operating_model_design"],
    frameworkHow: [
      "7S surfaces misalignment between strategy and delivery.",
      "Operating model design clarifies decision rights and workflows.",
    ],
    whyPrefix: "SWIFT themes and runs emphasise execution discipline across AI and Web3 operators.",
  },
  {
    id: "asset_ai_workflow_playbook_hrbp",
    title: "AI Workflow Redesign for HRBP Operating Rhythm",
    format: "Playbook",
    linkedSkillIds: ["skill_ai_literacy_workflow", "skill_manager_effectiveness_ai"],
    intendedOutput:
      "Playbook with 5 HRBP workflows, RACI-lite, automation boundaries, and weekly quality checks.",
    outline: [
      "Intake triage workflow",
      "Talent review workflow",
      "ER / risk triage workflow",
      "Automation vs human guardrails",
      "Metrics that trigger HRBP escalation",
    ],
    frameworkIds: ["ulrich_hrbp", "adkar"],
    frameworkHow: [
      "Ulrich clarifies strategic HRBP contribution vs transactional work.",
      "ADKAR sequences individual adoption for new tools and rituals.",
    ],
    whyPrefix: "Signals tie AI adoption to operating rhythm—not isolated tooling projects.",
  },
  {
    id: "asset_compliance_workforce_case",
    title: "Compliance-ready Workforce Planning in Crypto",
    format: "Case study",
    linkedSkillIds: ["skill_compliance_people_model", "skill_strategic_workforce_web3"],
    intendedOutput:
      "Case study structure: situation, regulatory pressure, workforce choices, outcomes, HRBP lessons.",
    outline: [
      "Situation and regulatory trigger",
      "Workforce scenarios (hire / upskill / defer)",
      "Controls and role criticality",
      "Stakeholder narrative",
      "Retrospective metrics",
    ],
    frameworkIds: ["strategic_workforce_planning", "kotter_8_step"],
    frameworkHow: [
      "Strategic workforce planning frames supply/demand under constraints.",
      "Kotter sequences sponsorship through wins for sensitive changes.",
    ],
    whyPrefix: "Compliance and regulation appear repeatedly in SWIFT weekly themes and learning focus strings.",
  },
  {
    id: "asset_people_analytics_exec_deck",
    title: "People Analytics Executive Briefing Pack",
    format: "Training deck",
    linkedSkillIds: ["skill_people_analytics_exec"],
    intendedOutput:
      "10–12 slide outline: questions, metrics, decision rules, and exec asks—no fabricated data.",
    outline: [
      "Executive questions first",
      "Five leading indicators with definitions",
      "Decision rules (threshold → action → owner)",
      "Risks and ethics guardrails",
      "Appendix: data definitions",
    ],
    frameworkIds: ["people_analytics_cycle", "balanced_scorecard"],
    frameworkHow: [
      "Decision cycle prevents metric theatre.",
      "Balanced scorecard links people metrics to broader outcomes.",
    ],
    whyPrefix: "Weekly summaries and runs stress analytics that drive decisions, not dashboards alone.",
  },
  {
    id: "asset_web3_talent_market_map",
    title: "Web3 Talent Market Map for HRBP Decision Partnering",
    format: "Market map",
    linkedSkillIds: ["skill_talent_market_intel", "skill_web3_domain_fluency"],
    intendedOutput:
      "2D market map axes (e.g., role family vs geography) with evidence tags from stored jobs and themes.",
    outline: [
      "Define segments (role families)",
      "Plot competitors / peer operators",
      "Tag evidence from SWIFT job rows",
      "Implications for EVP and hiring",
      "Next intelligence refresh checklist",
    ],
    frameworkIds: ["skills_taxonomy", "systems_thinking"],
    frameworkHow: [
      "Skills taxonomy keeps segments comparable over time.",
      "Systems thinking links hiring to delivery constraints.",
    ],
    whyPrefix: "Repeated employers and Web3/crypto language in the job corpus reward structured market intelligence.",
  },
  {
    id: "asset_interview_story_strong_signal",
    title: "Interview Story from Strongest SWIFT Signal",
    format: "Interview story",
    linkedSkillIds: ["skill_operating_model_lean_crypto", "skill_ai_literacy_workflow"],
    intendedOutput:
      "STAR-style story grounded in a real headline/theme from your repository (situation, tension, action, metric).",
    outline: [
      "Pick one Strong signal or top theme with evidence",
      "Situation and stakeholder tension",
      "Actions you would take as HRBP",
      "Outcome metrics (even if projected)",
      "Reflection for next role",
    ],
    frameworkIds: ["scarf", "situational_leadership"],
    frameworkHow: [
      "SCARF reduces resistance narratives in interviews.",
      "Situational leadership shows adaptive manager support.",
    ],
    whyPrefix: "SWIFT suggested actions explicitly reference a reusable interview story from recurring themes.",
  },
];

function buildLiveLearningAssets(
  rankedSkills: LiveSkillToPickUp[],
  weekly: Awaited<ReturnType<typeof getWeeklySummary>>,
): LiveLearningAsset[] {
  const skillById = new Map(rankedSkills.map((s) => [s.id, s]));
  const themeLine = weekly.topThemes
    .slice(0, 5)
    .map((t) => `${t.theme} (${t.count})`)
    .join(", ");
  const evidencePool = [
    ...weekly.suggestedNextActions.slice(0, 2),
    ...(themeLine ? [`Themes: ${themeLine}`] : []),
    ...(weekly.repeatedCompanies.length
      ? [`Repeat employers: ${weekly.repeatedCompanies.slice(0, 3).map((c) => c.company).join(", ")}`]
      : []),
  ];

  const assets: LiveLearningAsset[] = [];
  for (const tmpl of ASSET_TEMPLATES.slice(0, 6)) {
    let linked = tmpl.linkedSkillIds.map((id) => skillById.get(id)).filter(Boolean) as LiveSkillToPickUp[];
    if (linked.length === 0) {
      linked = rankedSkills.slice(0, 2);
    }
    if (linked.length === 0) continue;
    const topSkill = [...linked].sort((a, b) => b.priorityScore - a.priorityScore)[0]!;
    const linkedSkillPriority = Math.round((topSkill.priorityScore / 100) * 30);
    const marketDemandEvidence = clamp(
      Math.round(weekly.topThemes.length * 2 + weekly.totalCleanSignals / Math.max(1, weekly.runCount)),
      0,
      20,
    );
    const formatBoost =
      tmpl.format === "Interview story" || tmpl.format === "Case study"
        ? 18
        : tmpl.format === "Playbook" || tmpl.format === "Training deck"
          ? 16
          : 14;
    const reusableCareerValue = clamp(formatBoost + (linked.length > 1 ? 2 : 0), 0, 20);

    const frameworkRows = tmpl.frameworkIds
      .map((fid, i) => {
        const f = getFrameworkById(fid);
        if (!f) return null;
        return frameworkRef(f, tmpl.frameworkHow[i] ?? f.shortUseCase);
      })
      .filter(Boolean) as LiveLearningAsset["theoryPracticeFoundation"];

    const theoryPracticeScore = clamp(frameworkRows.length * 7 + 4, 0, 15);
    const outputClarity =
      tmpl.format === "One-pager" || tmpl.format === "Dashboard idea" ? 14 : 12;

    const breakdown = {
      linkedSkillPriority,
      marketDemandEvidence,
      reusableCareerValue,
      theoryPracticeFoundation: theoryPracticeScore,
      outputClarity,
    };
    const priorityScore = clamp(
      Math.round(
        breakdown.linkedSkillPriority +
          breakdown.marketDemandEvidence +
          breakdown.reusableCareerValue +
          breakdown.theoryPracticeFoundation +
          breakdown.outputClarity,
      ),
      0,
      100,
    );

    assets.push({
      id: tmpl.id,
      title: tmpl.title,
      format: tmpl.format,
      priority: priorityFromScore(priorityScore),
      priorityScore,
      status: "Planned",
      scoringBreakdown: breakdown,
      whyNow: `${tmpl.whyPrefix} ${FRAMEWORK_LIBRARY_LABEL}`,
      intendedOutput: tmpl.intendedOutput,
      outline: tmpl.outline,
      linkedSkills: linked.map((s) => s.title),
      sourceEvidence: [...new Set([...evidencePool, ...linked.flatMap((s) => s.evidenceSignals.slice(0, 2))])].slice(
        0,
        8,
      ),
      theoryPracticeFoundation: frameworkRows,
    });
  }
  return assets.sort((a, b) => b.priorityScore - a.priorityScore);
}

function mockFallbackResult(): LiveSkillsAndLearningResult {
  const skills: LiveSkillToPickUp[] = mockSkills.map((m) => {
    const breakdown = {
      marketTrendFrequency: 5,
      signalStrength: 4,
      jobRelevance: 4,
      hrbpStrategicLeverage: 12,
      portfolioInterviewValue: 10,
    };
    const priorityScore = totalSkillScore(breakdown);
    return {
      id: m.id,
      title: m.skill,
      category: m.category,
      priority: priorityFromScore(priorityScore),
      priorityScore,
      currentStatus: "Planned",
      scoringBreakdown: breakdown,
      whyItMatters: m.evidence,
      evidenceSignals: [
        "Mock corpus — configure Supabase and run reports to enable live SWIFT scoring from the repository.",
      ],
      suggestedAction: m.nextAction,
      relatedTopics: m.relatedAsset ? [m.relatedAsset] : ["Learning Assets"],
    };
  });

  const learningAssets: LiveLearningAsset[] = mockLearningAssets.slice(0, 6).map((a, idx) => {
    const fw = managementFrameworks[idx % managementFrameworks.length]!;
    const breakdown = {
      linkedSkillPriority: 16,
      marketDemandEvidence: 12,
      reusableCareerValue: 14,
      theoryPracticeFoundation: 10,
      outputClarity: 10,
    };
    const ps = clamp(
      breakdown.linkedSkillPriority +
        breakdown.marketDemandEvidence +
        breakdown.reusableCareerValue +
        breakdown.theoryPracticeFoundation +
        breakdown.outputClarity,
      0,
      100,
    );
    return {
      id: `fallback_${a.id}`,
      title: `${a.topic} (mock shape)`,
      format: (["One-pager", "Playbook", "Training deck", "Case study", "Market map", "Interview story"] as const)[
        idx % 6
      ],
      priority: priorityFromScore(ps),
      priorityScore: ps,
      status: "Planned",
      scoringBreakdown: breakdown,
      whyNow: `${a.changeReason} ${FRAMEWORK_LIBRARY_LABEL}`,
      intendedOutput: a.plannedAsset,
      outline: [a.purpose, a.nextAction, `Trend context: ${a.trend}`],
      linkedSkills: skills.slice(0, 2).map((s) => s.title),
      sourceEvidence: ["Mock learning asset row from SWIFT mockData"],
      theoryPracticeFoundation: [
        {
          frameworkName: fw.name,
          field: fw.field,
          howItSupportsTheAsset: fw.shortUseCase,
        },
      ],
    };
  });

  return {
    status: "fallback",
    generatedAt: new Date().toISOString(),
    source: "fallback_mock",
    priorityLogic: { ...PRIORITY_LOGIC },
    skills,
    learningAssets,
  };
}

/**
 * Live SWIFT-driven skills and learning assets (deterministic). Uses getWeeklySummary(7) + job rows.
 * Falls back to mock-shaped data when the repository is empty or unavailable.
 */
export async function getLiveSkillsAndLearning(): Promise<LiveSkillsAndLearningResult> {
  const generatedAt = new Date().toISOString();

  try {
    const weekly = await getWeeklySummary(7);
    const useLive =
      weekly.storageConfigured &&
      weekly.runCount > 0 &&
      weekly.status === "ok" &&
      !weekly.error;

    if (!useLive) {
      const fb = mockFallbackResult();
      return { ...fb, generatedAt, priorityLogic: { ...PRIORITY_LOGIC } };
    }

    const runs = (weekly.latestRuns ?? []) as Record<string, unknown>[];
    const runIds = runs.map((r) => r.id).filter((id): id is string => typeof id === "string");
    const jobs = await loadJobsForRuns(runIds);
    const runCorpus = collectRunCorpus(runs);
    const jobCorpus = collectJobCorpus(jobs);
    const ss = strongSignalStats(runs);

    const scored: LiveSkillToPickUp[] = [];
    for (const def of SKILL_DEFS) {
      const { breakdown, evidenceSignals, hasEvidence } = scoreSkill(def, {
        runCorpus,
        jobCorpus,
        jobs,
        topThemes: weekly.topThemes,
        totalClean: weekly.totalCleanSignals,
        totalRaw: weekly.totalRawSignals,
        runCount: weekly.runCount,
        ss,
      });
      if (!hasEvidence) continue;
      const priorityScore = totalSkillScore(breakdown);
      scored.push({
        id: def.id,
        title: def.title,
        category: def.category,
        priority: priorityFromScore(priorityScore),
        priorityScore,
        currentStatus: "Planned",
        scoringBreakdown: breakdown,
        whyItMatters: def.whyTemplate,
        evidenceSignals,
        suggestedAction: def.actionTemplate,
        relatedTopics: def.relatedTopics,
      });
    }

    scored.sort((a, b) => b.priorityScore - a.priorityScore);

    if (scored.length === 0) {
      const fb = mockFallbackResult();
      return { ...fb, generatedAt, priorityLogic: { ...PRIORITY_LOGIC } };
    }

    const learningAssets = buildLiveLearningAssets(scored, weekly);

    return {
      status: "ok",
      generatedAt,
      source: "repo_weekly_summary",
      priorityLogic: { ...PRIORITY_LOGIC },
      skills: scored,
      learningAssets,
    };
  } catch (e) {
    const fb = mockFallbackResult();
    return {
      ...fb,
      status: "error",
      generatedAt,
      priorityLogic: { ...PRIORITY_LOGIC },
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
