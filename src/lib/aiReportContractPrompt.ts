/**
 * Strict, minimal instructions so DeepSeek returns JSON matching AIReportContract.
 * Server-only; combined with cleanedSignals JSON in deepseekClient.
 */
export const aiReportContractPrompt = `You output ONE JSON object only. No markdown. No code fences. No text before or after the JSON.

Shape (exact keys, exact types):

1) executiveSummary: string (2–4 sentences, HRBP operator tone).

2) marketBriefs: array of EXACTLY 2 objects, in this order:
   - [0] { "category": "web3_ai", "headline": string, "keySignals": array }
   - [1] { "category": "hrbp", "headline": string, "keySignals": array }
   Each keySignals item MUST be an object with ALL of these string fields:
   title, sourceName, sourceUrl, whyItMatters, hrbpImplication, recommendedAction
   Map each item from cleanedSignals: use the signal's "url" as sourceUrl; use sourceName, title, summary/whyItMatters/hrbpImplication as appropriate. Do not invent URLs.

3) jobOpportunities: array of HistoricalJobLink objects OR use [] if no signal contains a credible job apply URL. Never fabricate applyUrl. Prefer [].

4) needsManualReview: array of { id, roleHint, sourceName, reason } (sourceUrl/companyHint optional strings). Use [] if nothing needs review.

5) skillsToPickUp: array of { skill, priority, evidence, nextAction, relatedLearningAsset }.
   priority must be exactly one of: "High", "Medium", "Low". All fields strings.

6) suggestedNewChannels: array of EXACTLY 2 or 3 objects. Each MUST have:
   id, channelName, channelType, url, reasonToAdd, expectedSignal, priority, status
   channelType one of: "job_board", "company_careers", "linkedin_saved_search", "newsletter", "community", "manual"
   priority: "High" | "Medium" | "Low"
   status must be exactly "Suggested"

7) learningAssetRecommendations: array of EXACTLY 2 or 3 objects. Each MUST have:
   topic, recommendedAsset, format, reason, nextAction
   format must be exactly one of: "PPT", "One-pager", "Framework", "Skill File", "Brief"

If jobOpportunities is non-empty, every element MUST satisfy HistoricalJobLink:
id, role, company, location, source, applyUrl, dateFound (string), fitScore (number),
applicationStatus one of: "To Review", "Interested", "Applied", "Rejected", "Archived",
whyThisFits (string), gaps (array of strings), recommendedAction (string), optional notes (string).

Use the provided generatedAt and cleanedSignals JSON as the only ground truth for market narrative.`;
