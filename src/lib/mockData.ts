export type Opportunity = {
  role: string;
  company: string;
  location: string;
  source: string;
  fitScore: number;
  whyThisFits: string;
  gaps: string[];
  recommendedAction: string;
};

export type SkillPriority = "High" | "Medium" | "Low";

export type SkillItem = {
  skill: string;
  category: string;
  priority: SkillPriority;
  evidence: string;
  currentLevel: "Awareness" | "Working" | "Confident";
  targetLevel: "Working" | "Confident" | "Expert";
  nextAction: string;
  relatedAsset: string;
};

export type LearningAssetPriority = "High" | "Medium" | "Low";
export type LearningAssetStatus =
  | "Planned"
  | "Researching"
  | "Drafting"
  | "Generated"
  | "Ready to Present";
export type LearningAssetTrend = "Increasing" | "Stable" | "Emerging";

export type LearningAsset = {
  topic:
    | "People Strategy & Operating Model"
    | "Talent Acquisition"
    | "Talent Management"
    | "Performance Management"
    | "Compensation & Reward"
    | "HR Metrics & People Analytics"
    | "Organisation Design & Workforce Planning"
    | "Change Management"
    | "Leadership & Manager Effectiveness"
    | "Employee Experience & Culture"
    | "Employee Relations & Risk"
    | "Learning, Capability & Skills"
    | "DEI, Inclusion & Belonging"
    | "HR Tech, AI & Automation"
    | "Web3 / AI Domain Knowledge for HRBP";
  purpose: string;
  priority: LearningAssetPriority;
  status: LearningAssetStatus;
  marketDemandScore: number;
  trend: LearningAssetTrend;
  plannedAsset: string;
  nextAction: string;
};

export const mockOpportunities: Opportunity[] = [
  {
    role: "HRBP, Product & Engineering (AI)",
    company: "Axiom Labs",
    location: "London (Hybrid)",
    source: "LinkedIn",
    fitScore: 86,
    whyThisFits:
      "High-leverage HRBP seat where operating model + capability mapping are core deliverables.",
    gaps: ["Deep hands-on people analytics instrumentation", "EU works council exposure"],
    recommendedAction:
      "Prepare a 30/60/90 with AI operating model changes + manager enablement plan.",
  },
  {
    role: "People Partner, GTM & RevOps",
    company: "Ledgerline",
    location: "Remote (EU)",
    source: "Company site",
    fitScore: 81,
    whyThisFits:
      "Strong match for commercial org design, performance cadence, and comp/IC hygiene.",
    gaps: ["Crypto market cycles narrative", "Comp banding at scale"],
    recommendedAction:
      "Draft a comp + performance cadence proposal for lean GTM teams.",
  },
  {
    role: "Senior HRBP, Compliance & Risk",
    company: "Northbridge Web3",
    location: "Dublin (Onsite)",
    source: "Recruiter",
    fitScore: 77,
    whyThisFits:
      "Regulatory-facing operating rhythm; ideal for compliance-ready growth and ER risk posture.",
    gaps: ["Onsite preference", "Specialist ER playbooks"],
    recommendedAction:
      "Map compliance capability roles and propose hiring vs upskilling splits.",
  },
];

export const mockSkills: SkillItem[] = [
  {
    skill: "AI Operating Model Design",
    category: "People Strategy",
    priority: "High",
    evidence:
      "More roles require HRBP input on work decomposition: automate vs augment vs human-led.",
    currentLevel: "Working",
    targetLevel: "Expert",
    nextAction:
      "Create a repeatable operating model canvas: work types, ownership, decision rights, metrics.",
    relatedAsset: "People Strategy & Operating Model",
  },
  {
    skill: "HR Analytics for Executive Decisions",
    category: "People Analytics",
    priority: "High",
    evidence:
      "Signals show lean teams want precision: capacity, productivity, attrition risk, and role criticality.",
    currentLevel: "Awareness",
    targetLevel: "Confident",
    nextAction:
      "Define 8–10 HRBP-ready metrics and how they translate to leadership actions each week.",
    relatedAsset: "HR Metrics & People Analytics",
  },
  {
    skill: "Compensation Narrative for Web3/AI",
    category: "Reward",
    priority: "Medium",
    evidence:
      "Market volatility pushes more scrutiny on cash/eq mix, leveling, and role-based value.",
    currentLevel: "Working",
    targetLevel: "Confident",
    nextAction:
      "Draft a comp philosophy one-pager with scenarios for hiring freezes and critical roles.",
    relatedAsset: "Compensation & Reward",
  },
];

export const mockLearningAssets: LearningAsset[] = [
  {
    topic: "People Strategy & Operating Model",
    purpose: "Turn market signals into practical org design and decision rhythms.",
    priority: "High",
    status: "Drafting",
    marketDemandScore: 88,
    trend: "Increasing",
    plannedAsset: "Executive playbook: AI-native HRBP operating model",
    nextAction: "Draft 3 operating model archetypes for lean AI teams.",
  },
  {
    topic: "Talent Acquisition",
    purpose: "Translate capability bets into sharper role definitions and hiring plans.",
    priority: "Medium",
    status: "Researching",
    marketDemandScore: 74,
    trend: "Stable",
    plannedAsset: "Role scorecards + capability interview kit",
    nextAction: "Collect 10 role profiles across AI/Web3 operators and map common patterns.",
  },
  {
    topic: "Talent Management",
    purpose: "Build retention and progression signals for small, senior-heavy teams.",
    priority: "Medium",
    status: "Planned",
    marketDemandScore: 71,
    trend: "Stable",
    plannedAsset: "Lean-team talent review blueprint",
    nextAction: "Define a 45-minute quarterly talent review agenda with action outputs.",
  },
  {
    topic: "Performance Management",
    purpose: "Create execution cadence and decision clarity under uncertainty.",
    priority: "High",
    status: "Researching",
    marketDemandScore: 83,
    trend: "Increasing",
    plannedAsset: "Performance cadence template for operator-led teams",
    nextAction: "Draft a 4-week cycle: goals → signals → decisions → coaching actions.",
  },
  {
    topic: "Compensation & Reward",
    purpose: "Support compensation decisions aligned to critical capabilities.",
    priority: "High",
    status: "Researching",
    marketDemandScore: 86,
    trend: "Increasing",
    plannedAsset: "Comp philosophy + leveling narrative for Web3/AI",
    nextAction: "Create 3 scenarios for cash/eq trade-offs by role criticality.",
  },
  {
    topic: "HR Metrics & People Analytics",
    purpose: "Provide weekly executive-ready people insights and actions.",
    priority: "High",
    status: "Drafting",
    marketDemandScore: 90,
    trend: "Increasing",
    plannedAsset: "Weekly HRBP metrics pack: signals-to-actions",
    nextAction: "Define the leading indicators for productivity and attrition risk.",
  },
  {
    topic: "Organisation Design & Workforce Planning",
    purpose: "Ensure workforce shape matches strategy while staying lean.",
    priority: "Medium",
    status: "Planned",
    marketDemandScore: 78,
    trend: "Stable",
    plannedAsset: "Workforce planning sprint kit",
    nextAction: "Draft a 2-week planning sprint with inputs/outputs and stakeholder roles.",
  },
  {
    topic: "Change Management",
    purpose: "Help leaders execute operating model shifts without cultural debt.",
    priority: "Medium",
    status: "Drafting",
    marketDemandScore: 76,
    trend: "Emerging",
    plannedAsset: "Change narrative + manager enablement package",
    nextAction: "Write a change storyline template for AI adoption waves.",
  },
  {
    topic: "Leadership & Manager Effectiveness",
    purpose: "Increase decision quality and coaching clarity in high-velocity teams.",
    priority: "High",
    status: "Planned",
    marketDemandScore: 85,
    trend: "Increasing",
    plannedAsset: "Manager operating system: rituals, feedback, and prioritization",
    nextAction: "Draft a 6-ritual manager system for lean teams.",
  },
  {
    topic: "Employee Experience & Culture",
    purpose: "Sustain engagement while teams scale selectively.",
    priority: "Low",
    status: "Planned",
    marketDemandScore: 62,
    trend: "Stable",
    plannedAsset: "Experience principles for hybrid operator teams",
    nextAction: "Define 5 culture principles tied to execution and risk posture.",
  },
  {
    topic: "Employee Relations & Risk",
    purpose: "Reduce risk exposure as compliance scrutiny increases.",
    priority: "Medium",
    status: "Researching",
    marketDemandScore: 69,
    trend: "Emerging",
    plannedAsset: "ER risk checklist for fast-moving orgs",
    nextAction: "Draft a lightweight ER risk triage framework for HRBPs.",
  },
  {
    topic: "Learning, Capability & Skills",
    purpose: "Turn capability gaps into targeted learning plans.",
    priority: "Medium",
    status: "Planned",
    marketDemandScore: 70,
    trend: "Stable",
    plannedAsset: "Capability roadmap: HRBP skill layer",
    nextAction: "Map skills to outputs and evidence of mastery.",
  },
  {
    topic: "DEI, Inclusion & Belonging",
    purpose: "Maintain inclusive decision-making while hiring becomes more selective.",
    priority: "Low",
    status: "Planned",
    marketDemandScore: 60,
    trend: "Stable",
    plannedAsset: "Inclusive hiring + progression safeguards",
    nextAction: "Draft 5 safeguards that fit lean teams without heavy process.",
  },
  {
    topic: "HR Tech, AI & Automation",
    purpose: "Leverage automation to increase HRBP speed and clarity.",
    priority: "High",
    status: "Generated",
    marketDemandScore: 92,
    trend: "Increasing",
    plannedAsset: "AI workflow stack: HRBP intelligence loop",
    nextAction: "Package as a 10-slide exec deck with operating metrics.",
  },
  {
    topic: "Web3 / AI Domain Knowledge for HRBP",
    purpose: "Build domain fluency to interpret market signals and hiring shifts.",
    priority: "High",
    status: "Generated",
    marketDemandScore: 89,
    trend: "Emerging",
    plannedAsset: "Domain primer: Web3 x AI for HRBP decisions",
    nextAction: "Generate a glossary + 30-question calibration quiz for leaders.",
  },
];

export const mockMonthlyChangeLog: string[] = [
  "HR Tech, AI & Automation moved from Drafting to Generated",
  "Compensation & Reward increased from Medium to High",
  "Web3 / AI Domain Knowledge moved from Researching to Generated",
  "Change Management moved from Planned to Drafting",
];

export const mockSettings = {
  sources: ["Company blogs", "LinkedIn", "VC memos", "Substack", "Regulatory updates"],
  searchKeywords: [
    "AI operating model",
    "HRBP productivity",
    "Web3 compliance hiring",
    "People analytics executive pack",
    "RevOps org design",
  ],
  emailRecipient: "raychen@company.com",
  refreshSchedule: "Daily at 06:30 (Europe/London)",
  aiProvider: "OpenAI (mock)",
  skillLayer: "HRBP Operator Layer v0.2",
};

