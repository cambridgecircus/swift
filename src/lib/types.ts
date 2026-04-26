/**
 * These types define the SWIFT intelligence data model and will be used by RSS ingestion,
 * AI report generation, Supabase storage, and PPT asset generation.
 */

export type MarketCategory = "web3_ai" | "hrbp" | "jobs" | "learning";

export type MarketSource = {
  id: string;
  name: string;
  type: "rss" | "website" | "job_board" | "manual";
  category: MarketCategory;
  url: string;
  enabled: boolean;
  notes?: string;
};

export type RawMarketItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
  rawSummary?: string;
  rawContent?: string;
};

export type CleanMarketSignal = {
  id: string;
  title: string;
  sourceName: string;
  url: string;
  publishedAt?: string;
  category: MarketCategory;
  tags: string[];
  relevanceScore: number;
  signalStrength: "Weak" | "Moderate" | "Strong";
  summary: string;
  whyItMatters: string;
  hrbpImplication: string;
};

export type DailyBrief = {
  id: string;
  title: string;
  category: "web3_ai" | "hrbp";
  generatedAt: string;
  headline: string;
  executiveSummary: string;
  keySignals: CleanMarketSignal[];
  sourceCount: number;
};

export type StrongSignal = {
  id: string;
  signalType:
    | "Hiring Signal"
    | "Layoff / Restructuring Signal"
    | "Regulation Signal"
    | "Product / Business Model Signal"
    | "AI Automation Signal"
    | "Leadership / Capability Signal";
  title: string;
  whyThisIsStrong: string;
  affectedFunctions: string[];
  peopleImplication: string;
  suggestedHrbpAction: string;
  confidenceScore: number;
  sourceUrls: string[];
};

export type JobOpportunity = {
  id: string;
  role: string;
  company: string;
  location: string;
  source: string;
  url?: string;
  applyUrl?: string;
  dateFound: string;
  fitScore: number;
  seniorityFit: "Low" | "Medium" | "High";
  sectorFit: "Low" | "Medium" | "High";
  whyThisFits: string;
  gaps: string[];
  recommendedAction: string;
};

export type JobMarketTakeaway = {
  id: string;
  takeaway: string;
  evidence: string;
  implicationForMe: string;
  relatedSkills: string[];
};

export type SkillToPickUp = {
  id: string;
  skill: string;
  category:
    | "AI / Automation"
    | "Web3 / Crypto"
    | "HRBP Strategic"
    | "Commercial / Product"
    | "Data / Analytics"
    | "Executive Communication";
  priority: "High" | "Medium" | "Low";
  evidence: string;
  currentLevel: "Beginner" | "Working" | "Strong" | "Expert";
  targetLevel: "Working" | "Strong" | "Expert";
  nextAction: string;
  relatedAsset?: string;
};

export type LearningAsset = {
  id: string;
  topic: string;
  purpose: string;
  priority: "High" | "Medium" | "Low";
  status: "Planned" | "Researching" | "Drafting" | "Generated" | "Ready to Present";
  marketDemandScore: number;
  trend: "Increasing" | "Stable" | "Emerging";
  plannedAsset: string;
  nextAction: string;
  lastChangedAt: string;
  changeReason: string;
};

export type LearningAssetHistory = {
  id: string;
  assetId: string;
  topic: string;
  date: string;
  previousPriority?: "High" | "Medium" | "Low";
  newPriority?: "High" | "Medium" | "Low";
  previousStatus?: "Planned" | "Researching" | "Drafting" | "Generated" | "Ready to Present";
  newStatus?: "Planned" | "Researching" | "Drafting" | "Generated" | "Ready to Present";
  marketDemandScore: number;
  evidenceCount: number;
  reason: string;
  sourceSummary: string;
};

export type GeneratedAsset = {
  id: string;
  title: string;
  type: "PPT" | "One-pager" | "Framework" | "Skill File" | "Brief";
  relatedTopic: string;
  status: "Planned" | "Drafted" | "Generated" | "Ready to Present";
  createdAt?: string;
  fileUrl?: string;
  useCase: string;
};

export type SwiftReport = {
  id: string;
  generatedAt: string;
  web3AiBrief: DailyBrief;
  hrbpBrief: DailyBrief;
  strongSignals: StrongSignal[];
  jobOpportunities: JobOpportunity[];
  jobMarketTakeaways: JobMarketTakeaway[];
  skillsToPickUp: SkillToPickUp[];
  learningAssetChanges: LearningAssetHistory[];
};

export type SourceType =
  | "rss"
  | "json_feed"
  | "api"
  | "website"
  | "newsletter"
  | "job_board"
  | "manual";

export type SourceTopic = "web3" | "ai" | "hr" | "jobs" | "learning";

export type SwiftSection =
  | "dashboard"
  | "job_opportunities"
  | "skills_to_pick_up"
  | "learning_assets"
  | "settings";

export type QualityTier = "Tier 1" | "Tier 2" | "Tier 3";

export type SourceRegistryItem = {
  id: string;
  name: string;
  sourceType: SourceType;
  topic: SourceTopic;
  category: MarketCategory;
  usedBy: SwiftSection[];
  qualityTier: QualityTier;
  url: string;
  enabled: boolean;
  accessType: "public" | "api_key_required" | "manual_review";
  notes: string;
};

export type SourceHealthStatus = "ok" | "failed" | "disabled" | "unknown";

export type SourceHealthResult = {
  sourceId: string;
  sourceName: string;
  url: string;
  status: SourceHealthStatus;
  itemCount: number;
  errorMessage?: string;
  checkedAt: string;
};

export type ApplicationStatus =
  | "To Review"
  | "Interested"
  | "Applied"
  | "Rejected"
  | "Archived";

export type SuggestedChannelStatus =
  | "Suggested"
  | "Approved"
  | "Ignored"
  | "Added Later";

export type JobApplicationChannel = {
  id: string;
  name: string;
  channelType:
    | "job_board"
    | "company_careers"
    | "linkedin_saved_search"
    | "newsletter"
    | "community"
    | "manual";
  url: string;
  topic: "web3" | "ai" | "hr" | "jobs";
  enabled: boolean;
  qualityTier: QualityTier;
  usedBy: ("job_opportunities" | "skills_to_pick_up" | "settings")[];
  lastCheckedAt?: string;
  notes: string;
};

export type HistoricalJobLink = {
  id: string;
  role: string;
  company: string;
  location: string;
  source: string;
  applyUrl: string;
  dateFound: string;
  fitScore: number;
  applicationStatus: ApplicationStatus;
  whyThisFits: string;
  gaps: string[];
  recommendedAction: string;
  notes?: string;
};

export type SuggestedNewChannel = {
  id: string;
  channelName: string;
  channelType:
    | "job_board"
    | "company_careers"
    | "linkedin_saved_search"
    | "newsletter"
    | "community"
    | "manual";
  url: string;
  reasonToAdd: string;
  expectedSignal: string;
  priority: "High" | "Medium" | "Low";
  status: SuggestedChannelStatus;
};

export type NeedsManualReviewJob = {
  id: string;
  roleHint: string;
  companyHint?: string;
  sourceName: string;
  sourceUrl?: string;
  reason: string;
};

export type AIReportContract = {
  executiveSummary: string;
  marketBriefs: {
    category: "web3_ai" | "hrbp";
    headline: string;
    keySignals: {
      title: string;
      sourceName: string;
      sourceUrl: string;
      whyItMatters: string;
      hrbpImplication: string;
      recommendedAction: string;
    }[];
  }[];
  jobOpportunities: HistoricalJobLink[];
  needsManualReview: NeedsManualReviewJob[];
  skillsToPickUp: {
    skill: string;
    priority: "High" | "Medium" | "Low";
    evidence: string;
    nextAction: string;
    relatedLearningAsset: string;
  }[];
  suggestedNewChannels: SuggestedNewChannel[];
  learningAssetRecommendations: {
    topic: string;
    recommendedAsset: string;
    format: "PPT" | "One-pager" | "Framework" | "Skill File" | "Brief";
    reason: string;
    nextAction: string;
  }[];
};

