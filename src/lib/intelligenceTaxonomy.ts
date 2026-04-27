/**
 * Central taxonomies for Employment Law and Expansion / Downsizing / Restructuring classification.
 * Used by RSS/signal pipelines, weekly summary, deterministic report fallbacks, and AI prompt guidance.
 */

export type EmploymentLawConfidence = "high" | "medium" | "low";

export type ExpansionDownsizeConfidence = "high" | "medium" | "low";

export type QualifiedEmploymentLawSnippet = {
  title: string;
  summary: string;
  url?: string;
  jurisdiction?: string;
  lawTheme?: string;
  confidence: EmploymentLawConfidence;
  whyItQualifies: string;
  hrbpImplication: string;
  suggestedAction: string;
  sourceName: string;
};

/** Positive phrases (substring match, case-insensitive). Prefer multi-word where ambiguous. */
export const EMPLOYMENT_LAW_POSITIVE: readonly string[] = [
  "employment law",
  "labour law",
  "labor law",
  "worker rights",
  "employment rights",
  "workplace rights",
  "unfair dismissal",
  "wrongful dismissal",
  "dismissal",
  "redundancy law",
  "redundancy consultation",
  "collective consultation",
  "collective redundancy",
  "works council",
  "employee relations",
  "er case",
  "grievance",
  "disciplinary",
  "workplace discrimination",
  "harassment",
  "equal pay",
  "pay transparency",
  "gender pay gap",
  "working time",
  "holiday pay",
  "minimum wage",
  "national living wage",
  "employment tribunal",
  "non-compete",
  "restrictive covenant",
  "contractor classification",
  "worker status",
  "gig worker",
  "platform worker",
  "remote work regulation",
  "right to work",
  "visa sponsorship",
  "immigration compliance",
  "whistleblowing",
  "data privacy at work",
  "employee monitoring",
  "algorithmic management",
  "ai at work",
  "workplace ai",
  "workplace surveillance",
  "health and safety at work",
  "occupational health",
  "flexible working",
  "parental leave",
  "sick pay",
  "tupe",
  "trade union",
  "collective bargaining",
];

export const EMPLOYMENT_LAW_GEOGRAPHY: readonly string[] = [
  "united kingdom",
  "uk",
  "britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "european union",
  " europe",
  " eu ",
  "uae",
  "united arab emirates",
  "dubai",
  "abu dhabi",
  "saudi arabia",
  "saudi",
  "riyadh",
  "gcc",
  "qatar",
  "kuwait",
  "bahrain",
  "oman",
];

/** Crypto / securities regulation — block unless rescue terms also present. */
export const EMPLOYMENT_LAW_EXCLUSION: readonly string[] = [
  "sec ",
  " sec",
  "defi",
  "etf",
  "bitcoin",
  "stablecoin",
  "token",
  "crypto atm",
  "crypto exchange",
  "broker guidance",
  "securities law",
  "market regulation",
  "trading regulation",
  "listing regulation",
  " aml",
  "aml ",
  "kyc",
  "mica",
  "genius act",
  "cftc",
  "blockchain regulation",
  "digital asset regulation",
];

export const EMPLOYMENT_LAW_RESCUE: readonly string[] = [
  "employee",
  "employees",
  "workforce",
  "employment contract",
  "hr policy",
  "people operations",
  "workplace compliance",
  "labour law",
  "labor law",
  "employee rights",
  "redundancy",
  "dismissal",
  "consultation",
  "immigration",
  "right to work",
  "worker status",
  "gig worker",
  "platform worker",
];

export const EMPLOYMENT_LAW_TIER1_SOURCE_MARKERS: readonly string[] = [
  "cipd",
  "acas",
  "gov.uk",
  "hm courts",
  "employment tribunal",
  "ilo",
  "oecd",
  "employment law worldview",
  "lewis silkin",
  "fisher phillips",
  "littler",
  "dentons",
  "cms law",
  "hogan lovells",
];

/** Strong expansion — workforce / footprint signals. */
export const EXPANSION_STRONG: readonly string[] = [
  // Workforce / organisation / footprint actions (must be explicit)
  "hiring",
  "hiring spree",
  "hiring plans",
  "plans to hire",
  "adding roles",
  "adding jobs",
  "new hires",
  "headcount growth",
  "headcount increase",
  "workforce expansion",
  "team expansion",
  "expanding team",
  "expand its team",
  "workforce buildout",
  "scaling hiring",
  "office opening",
  "opens office",
  "new office",
  "new hub",
  "regional hub",
  "headquarters",
  "new headquarters",
  "new regional hub",
  "entity setup",
  "new entity",
  "market entry",
  "enters market",
  "launches operations",
  "expands operations",
  "geographic expansion",
  "international expansion",
  "regional expansion",
  "gcc expansion",
  "middle east expansion",
  "uae expansion",
  "dubai expansion",
  "abu dhabi expansion",
  "saudi expansion",
  "riyadh expansion",
  "uk expansion",
  "europe expansion",
  "launches operations",
  "scaling team",
  "scaling operations",
  "go-to-market expansion",
  "buildout",
  "country manager",
  "regional director",
  "office opening",
];

/** Weaker growth words — need an anchor from EXPANSION_ANCHOR to qualify. */
export const EXPANSION_WEAK: readonly string[] = [
  "expansion",
  "growth",
  "scaling",
  "opens",
  "opening",
  "enters",
  "setup",
  "set up",
  "establishes",
  "launches operations",
];

export const EXPANSION_ANCHOR: readonly string[] = [
  // Must be workforce/org/footprint; funding alone is not sufficient.
  "hire",
  "hiring",
  "headcount",
  "recruit",
  "recruiting",
  "jobs",
  "roles",
  "workforce",
  "team",
  "people",
  "office",
  "hub",
  "headquarters",
  "entity",
  "market entry",
  "regional",
  "international",
  "uae",
  "dubai",
  "gcc",
  "saudi",
  "riyadh",
  "uk",
  "europe",
];

export const EXPANSION_HRBP_HINTS: readonly string[] = [
  "hiring demand",
  "workforce planning",
  "org design",
  "leadership bench",
  "capability build",
  "talent pipeline",
  "entity setup",
  "employment model",
  "onboarding scale",
  "manager enablement",
  "operating model",
];

export const DOWNSIZING_TERMS: readonly string[] = [
  "layoffs",
  "layoff",
  "redundancies",
  "redundancy",
  "job cuts",
  "cuts jobs",
  "workforce reduction",
  "headcount reduction",
  "reduce headcount",
  "staff cuts",
  "workforce cuts",
  "hiring freeze",
  "freezes hiring",
  "slows hiring",
  "pause hiring",
  "cost cutting",
  "cost reduction",
  "office closure",
  "closes office",
  "market exit",
  "exits market",
  "shutdown",
  "shuts down",
  "unit closure",
  "role elimination",
  "eliminates roles",
  "rif",
  "rightsizing",
  "severance",
  "performance-driven exits",
];

export const RESTRUCTURING_TERMS: readonly string[] = [
  "restructuring",
  "restructure",
  "reorganisation",
  "reorganization",
  "team consolidation",
  "operating model change",
  "flattening organisation",
  "flattening organization",
  "transformation programme",
  "transformation program",
  "delayering",
  "collective consultation",
  "works council",
  "redeployment",
];

export const DOWNSIZING_HRBP_HINTS: readonly string[] = [
  "consultation",
  "er risk",
  "manager enablement",
  "change management",
  "communication plan",
  "retention risk",
  "survivor morale",
  "redeployment",
  "selection criteria",
];

function normBlob(parts: (string | undefined | null)[]): string {
  return parts
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join(" \n ");
}

function lower(s: string): string {
  return s.toLowerCase();
}

function countHits(blobLower: string, phrases: readonly string[]): number {
  let n = 0;
  for (const p of phrases) {
    const pl = p.toLowerCase().trim();
    if (!pl) continue;
    let idx = 0;
    while (idx !== -1) {
      idx = blobLower.indexOf(pl, idx);
      if (idx === -1) break;
      n++;
      idx += pl.length;
    }
  }
  return n;
}

function hasAny(blobLower: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => blobLower.includes(p.toLowerCase().trim()));
}

export function employmentLawExclusionWithoutRescue(blobLower: string): boolean {
  const ex = hasAny(blobLower, EMPLOYMENT_LAW_EXCLUSION);
  if (!ex) return false;
  return !hasAny(blobLower, EMPLOYMENT_LAW_RESCUE);
}

export function matchesEmploymentLawPositive(blobLower: string): boolean {
  return hasAny(blobLower, EMPLOYMENT_LAW_POSITIVE);
}

export function inferEmploymentLawJurisdiction(blobLower: string): string | undefined {
  for (const g of EMPLOYMENT_LAW_GEOGRAPHY) {
    const gl = g.toLowerCase().trim();
    if (blobLower.includes(gl)) {
      return g
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return undefined;
}

export function inferEmploymentLawTheme(blobLower: string): string {
  const themeBuckets: { label: string; keys: readonly string[] }[] = [
    { label: "Dismissal & redundancy", keys: ["dismissal", "redundancy", "tribunal", "collective consultation", "grievance", "disciplinary"] },
    { label: "Pay & working time", keys: ["pay", "wage", "holiday pay", "working time", "equal pay", "transparency"] },
    { label: "Worker status & contracts", keys: ["worker status", "contractor", "gig worker", "non-compete", "restrictive covenant", "employment contract"] },
    { label: "Rights, equality & conduct", keys: ["discrimination", "harassment", "whistleblow", "surveillance", "monitoring"] },
    { label: "Mobility & compliance", keys: ["right to work", "visa", "immigration", "sponsorship"] },
    { label: "Health, safety & leave", keys: ["health and safety", "occupational health", "parental leave", "sick pay", "flexible working"] },
  ];
  for (const b of themeBuckets) {
    if (b.keys.some((k) => blobLower.includes(k))) return b.label;
  }
  return "Employment regulation";
}

function tier1Source(sourceLower: string): boolean {
  return EMPLOYMENT_LAW_TIER1_SOURCE_MARKERS.some((m) => sourceLower.includes(m));
}

export function classifyEmploymentLawSignal(input: {
  title: string;
  summary: string;
  sourceName?: string;
  sourceUrl?: string;
}): QualifiedEmploymentLawSnippet | null {
  const blob = normBlob([input.title, input.summary, input.sourceName]);
  const blobLower = lower(blob);
  const sourceLower = lower(input.sourceName ?? "");

  if (!matchesEmploymentLawPositive(blobLower)) return null;
  if (employmentLawExclusionWithoutRescue(blobLower)) return null;

  const posHits = countHits(blobLower, EMPLOYMENT_LAW_POSITIVE);
  const jurisdiction = inferEmploymentLawJurisdiction(blobLower);
  const lawTheme = inferEmploymentLawTheme(blobLower);
  const t1 = tier1Source(sourceLower);
  let confidence: EmploymentLawConfidence = "low";
  if (t1 || posHits >= 3) confidence = "high";
  else if (posHits >= 2 || jurisdiction) confidence = "medium";

  const whyItQualifies = t1
    ? "Matched employment-law themes and a recognised people-policy / tribunal-grade source."
    : posHits >= 2
      ? "Multiple employment-law anchors in the same item (not securities-only regulation)."
      : "Matched employment-law keywords with workforce or workplace context.";

  return {
    title: input.title.trim() || "Signal",
    summary: input.summary.slice(0, 280) || "Qualified employment-law signal from ingested text.",
    url: input.sourceUrl && /^https?:\/\//i.test(input.sourceUrl) ? input.sourceUrl : undefined,
    jurisdiction,
    lawTheme,
    confidence,
    whyItQualifies,
    hrbpImplication:
      "Pressure-test policy, manager guidance and ER risk with People/Legal for affected populations and locations.",
    suggestedAction:
      "Route to triage: confirm jurisdiction, employee segments touched, and whether internal comms or playbook updates are needed.",
    sourceName: input.sourceName?.trim() || "Source",
  };
}

export function hasStrongExpansion(blobLower: string): boolean {
  return hasAny(blobLower, EXPANSION_STRONG);
}

/** Generic non-event content that should not count as expansion/downsizing signals. */
export function isExcludedGenericContent(blobLower: string): boolean {
  return Boolean(excludedGenericReason(blobLower));
}

export function excludedGenericReason(blobLower: string): string | null {
  const s = blobLower;

  const hasAnyWorkforceEventCue = (text: string): boolean => {
    // IMPORTANT: must not call is*Qualified() to avoid recursion.
    const exp = hasStrongExpansion(text) || (hasCompanyOrgActionCue(text) && hasWorkforceOrFootprintCue(text));
    const down = hasAny(text, DOWNSIZING_TERMS);
    const restruct = hasAny(text, RESTRUCTURING_TERMS) && hasAny(text, ["team", "organi", "operating model", "roles", "headcount", "workforce", "consultation", "works council"]);
    return exp || down || restruct;
  };

  // HR learning / role-definition / thought-leadership patterns (non-event).
  const learningish = [
    "all you need to know",
    "what is ",
    "what’s ",
    "whats ",
    "explained",
    "guide",
    "template",
    "checklist",
    "webinar",
    "course",
    "certification",
    "certificate",
    "training",
    "learn",
    "learning",
    "playbook",
    "role",
    "job description",
    "career path",
    "chief people officer",
    "cpo:",
    "cpo ",
  ] as const;
  if (learningish.some((p) => s.includes(p))) {
    // Allow through only if there's explicit workforce event language elsewhere.
    if (!hasAnyWorkforceEventCue(s)) {
      return "Excluded: HR learning / role-definition article, no workforce event signal.";
    }
  }

  // Generic product updates / launches (non-workforce).
  const productish = [
    "making ",
    "improving",
    "product update",
    "update to",
    "new feature",
    "launches feature",
    "rolls out",
    "release",
    "releases",
    "announces new",
    "built for",
    "use case",
    "for clinicians",
    "for developers",
    "for creators",
  ] as const;
  if (productish.some((p) => s.includes(p))) {
    if (!hasAnyWorkforceEventCue(s)) {
      return "Excluded: product update / use-case content without workforce or org-change signal.";
    }
  }

  // Crypto / fund / ETF / token launches should not be treated as org expansion by default.
  const financeLaunch = [
    "stablecoin",
    "token",
    "etf",
    "fund",
    "reserves fund",
    "defi",
    "sec",
    "maca",
    "mica",
    "genius act",
    "cftc",
    "exchange",
    "listing",
    "trading",
  ] as const;
  if (financeLaunch.some((p) => s.includes(p)) && (s.includes("launch") || s.includes("launches"))) {
    if (!hasAny(s, ["hire", "hiring", "headcount", "jobs", "roles", "office", "hub", "entity", "market entry", "expands operations", "launches operations", "expanding team"])) {
      return "Excluded: product/fund/token launch without hiring/headcount/office/entity/market-entry signal.";
    }
  }

  return null;
}

function hasCompanyOrgActionCue(blobLower: string): boolean {
  // We can’t reliably detect named entities from lowercased text, so require an org-action verb cue.
  return (
    /\b(announc|plans?|opens?|opening|set[s ]up|establish|enter[s ]|launches operations|expands operations|buildout|builds|appoints|acquir|merg|partner)\b/i.test(
      blobLower,
    ) || hasAny(blobLower, ["opens office", "office opening", "new office", "new hub", "headquarters", "entity setup", "new entity"])
  );
}

function hasWorkforceOrFootprintCue(blobLower: string): boolean {
  return hasAny(blobLower, [
    "hire",
    "hiring",
    "headcount",
    "jobs",
    "roles",
    "workforce",
    "team",
    "office",
    "hub",
    "headquarters",
    "entity",
    "market entry",
    "regional expansion",
    "international expansion",
    "expands operations",
    "launches operations",
    "country manager",
    "regional director",
  ]);
}

function hasFundingCue(blobLower: string): boolean {
  return /\b(raises|raise|funding|series [abc]|strategic investment|investment round|seed round)\b/i.test(blobLower);
}

/** Strict: requires (1) org/action cue AND (2) workforce/footprint cue. Funding/product launches alone do not qualify. */
export function isExpansionQualified(blobLower: string): boolean {
  if (excludedGenericReason(blobLower)) return false;

  // Strong expansion phrases are workforce/footprint by design, but still require a company/org action cue.
  const strong = hasStrongExpansion(blobLower);
  const weakWithAnchor = hasAny(blobLower, EXPANSION_WEAK) && hasWorkforceOrFootprintCue(blobLower);

  if (!(strong || weakWithAnchor)) return false;

  // Funding only counts when paired with workforce/footprint language.
  if (hasFundingCue(blobLower) && !hasWorkforceOrFootprintCue(blobLower)) return false;

  return hasCompanyOrgActionCue(blobLower) && hasWorkforceOrFootprintCue(blobLower);
}

/** Strict downsizing: explicit headcount/workforce reduction or hiring freeze/cost-cutting with workforce cues. */
export function isDownsizingQualified(blobLower: string): boolean {
  if (excludedGenericReason(blobLower)) return false;
  if (!hasAny(blobLower, DOWNSIZING_TERMS)) return false;
  // Guard: generic cost terms must be tied to workforce/org language.
  if (hasAny(blobLower, ["cost cutting", "cost reduction", "efficiency"]) && !hasAny(blobLower, ["layoff", "redundan", "headcount", "workforce", "jobs", "roles", "hiring freeze", "office closure", "market exit", "shutdown"])) {
    return false;
  }
  return true;
}

/** Strict restructuring: explicit restructuring language plus org/workforce context. */
export function isRestructuringQualified(blobLower: string): boolean {
  if (excludedGenericReason(blobLower)) return false;
  if (!hasAny(blobLower, RESTRUCTURING_TERMS)) return false;
  const orgContext =
    hasAny(blobLower, ["team", "organisation", "organization", "operating model", "function", "department", "roles", "headcount", "workforce", "redeployment", "works council", "consultation"]) ||
    /\b(team|organi[sz]ation|operating model|department|function|roles?)\b/i.test(blobLower);
  return orgContext;
}

export function qualifiesExpansionSignal(blobLower: string): boolean {
  return isExpansionQualified(blobLower);
}

export function qualifiesDownsizingSignal(blobLower: string): boolean {
  return isDownsizingQualified(blobLower);
}

export function qualifiesRestructuringSignal(blobLower: string): boolean {
  return isRestructuringQualified(blobLower);
}

export function expansionSignalConfidence(blobLower: string): ExpansionDownsizeConfidence {
  if (hasAny(blobLower, EXPANSION_STRONG)) {
    const hr = EXPANSION_HRBP_HINTS.some((h) => blobLower.includes(h)) || /hire|headcount|office|funding|series/i.test(blobLower);
    return hr ? "high" : "medium";
  }
  if (hasAny(blobLower, EXPANSION_WEAK) && hasAny(blobLower, EXPANSION_ANCHOR)) return "medium";
  return "low";
}

export function downsizingSignalConfidence(blobLower: string): ExpansionDownsizeConfidence {
  const n = countHits(blobLower, DOWNSIZING_TERMS) + countHits(blobLower, RESTRUCTURING_TERMS);
  if (n >= 2) return "high";
  if (n === 1) return "medium";
  return "low";
}
