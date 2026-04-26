/**
 * Curated internal framework library — stable references for theory/practice grounding.
 * Not generated from live web search; SWIFT uses these as explicit, well-known anchors.
 */
export const FRAMEWORK_LIBRARY_LABEL =
  "Curated internal framework library (well-known management/HR references; no live web search).";

export type FrameworkField =
  | "HR"
  | "Management"
  | "Behavioural Science"
  | "Org Design"
  | "Strategy"
  | "People Analytics";

export type CuratedManagementFramework = {
  id: string;
  name: string;
  field: FrameworkField;
  bestFor: string;
  shortUseCase: string;
};

export const managementFrameworks: CuratedManagementFramework[] = [
  {
    id: "ulrich_hrbp",
    name: "Ulrich HR Business Partner model",
    field: "HR",
    bestFor: "Clarifying HRBP roles, business partnership, and service vs strategic contribution.",
    shortUseCase: "Position HRBP deliverables as strategic partner vs transactional split.",
  },
  {
    id: "kotter_8_step",
    name: "Kotter 8-Step Change Model",
    field: "Management",
    bestFor: "Sequencing sponsorship, coalition, vision, and wins during operating model shifts.",
    shortUseCase: "Structure AI adoption or compliance-led org changes into phased actions.",
  },
  {
    id: "mckinsey_7s",
    name: "McKinsey 7S",
    field: "Strategy",
    bestFor: "Aligning strategy, structure, systems, style, staff, skills, and shared values.",
    shortUseCase: "Diagnose misalignment when scaling lean crypto teams.",
  },
  {
    id: "scarf",
    name: "SCARF model (Rock)",
    field: "Behavioural Science",
    bestFor: "Status, certainty, autonomy, relatedness, fairness in change and comms.",
    shortUseCase: "Reduce resistance when redesigning workflows or performance cadence.",
  },
  {
    id: "okrs",
    name: "OKRs",
    field: "Management",
    bestFor: "Outcome focus, alignment, and measurable priorities across teams.",
    shortUseCase: "Tie people initiatives to exec-visible outcomes in Web3/AI contexts.",
  },
  {
    id: "systems_thinking",
    name: "Systems thinking",
    field: "Org Design",
    bestFor: "Seeing feedback loops between hiring, capability, and delivery constraints.",
    shortUseCase: "Explain workforce trade-offs beyond headcount lists.",
  },
  {
    id: "strategic_workforce_planning",
    name: "Strategic workforce planning",
    field: "People Analytics",
    bestFor: "Connecting business strategy to role criticality and supply/demand of skills.",
    shortUseCase: "Prioritise roles under hiring scrutiny or regulatory pressure.",
  },
  {
    id: "skills_taxonomy",
    name: "Skills taxonomy / capability mapping",
    field: "HR",
    bestFor: "Defining capabilities, proficiency, and hiring vs upskilling choices.",
    shortUseCase: "Ground job scorecards and learning paths in shared language.",
  },
  {
    id: "people_analytics_cycle",
    name: "People analytics decision cycle",
    field: "People Analytics",
    bestFor: "Question → data → insight → action → review for exec-ready metrics.",
    shortUseCase: "Package weekly metrics into decisions, not observations.",
  },
  {
    id: "operating_model_design",
    name: "Operating model design",
    field: "Org Design",
    bestFor: "Decision rights, workflows, and interfaces between functions.",
    shortUseCase: "Design AI-native HRBP operating rhythms with lean teams.",
  },
  {
    id: "situational_leadership",
    name: "Situational leadership",
    field: "Management",
    bestFor: "Adapting directive vs supportive style by team maturity.",
    shortUseCase: "Enable managers in high-velocity AI-native teams.",
  },
  {
    id: "adkar",
    name: "ADKAR",
    field: "Management",
    bestFor: "Awareness, desire, knowledge, ability, reinforcement for individual change.",
    shortUseCase: "Support tool rollouts and compliance process adoption.",
  },
  {
    id: "balanced_scorecard",
    name: "Balanced scorecard",
    field: "Strategy",
    bestFor: "Balancing financial, customer, process, and learning perspectives.",
    shortUseCase: "Frame people metrics alongside business outcomes for execs.",
  },
];

export function getFrameworkById(id: string): CuratedManagementFramework | undefined {
  return managementFrameworks.find((f) => f.id === id);
}
