/**
 * Strict instructions so DeepSeek returns JSON matching AIReportContract.
 * Server-only; combined with input JSON in deepseekClient.
 */
export const aiReportContractPrompt = `You output ONE JSON object only. No markdown. No code fences. No text before or after the JSON.

Ground truth is the provided Input JSON only: cleanedSignals, jobOpportunityDefaults, weeklyPattern, generatedAt.
Do not invent jobs, apply links, or employment law updates. If a fact is not in the input, say so in prose fields and use [] or empty strings as appropriate.
Distinguish facts (what changed / what the signal says) from HRBP interpretation (implications, actions).
This is not legal advice: use "HRBP implications" language; never provide legal advice.

Employment law classification (strict):
- Only put an item in employmentLaw.items when it explicitly relates to employment, workforce, workplace, HR policy, employee rights, dismissal, redundancy, consultation, working time, pay, worker status, discrimination, employment tribunal, immigration / right-to-work, employee monitoring, AI at work, labour/labor law, or similar workforce law themes.
- Do NOT treat SEC, DeFi, ETF, stablecoin, MiCA, CFTC, crypto exchange, AML/KYC, securities law, broker guidance, blockchain regulation, or generic market/listing/trading regulation as employment law unless the same item explicitly ties to employees, workforce, employment contracts, HR policy, people operations, workplace compliance, labour law, employee rights, redundancy/dismissal/consultation, or immigration/right-to-work.
- Crypto / financial regulation is NOT employment law by default.
- Never invent legal updates. If none qualify, employmentLaw.items must be [] and employmentLaw.headline must state that no strong employment law update was found in this run.
- Each employmentLaw item may include optional strings jurisdiction, lawTheme, whyItQualifies, and optional confidence "high"|"medium"|"low" when you can ground them in the signal text.

Expansion & downsizing classification (strict):
- expansionDownsizing.expansionCount / downsizingCount / restructuringCount must be non-negative integers aligned with the signals you summarise (may be 0).
- expansion: hiring/headcount growth, new office/hub/HQ, market entry, regional expansion, entity setup, funding to scale, explicit operational scaling — not generic product launches unless hiring, regional expansion, office/entity setup, funding/investment, or explicit market entry / major operational scaling is also present.
- downsizing: layoffs, redundancy, job cuts, hiring freeze, workforce/headcount reduction.
- restructuring: reorganisation, transformation programme, operating model change, delayering/streamlining when clearly about organisation/workforce (overlap with downsizing is OK; do not double-count the same headline in summaries).
- Classify each narrative as expansion OR downsizing OR restructuring where possible; use counts consistently with strongestExpansionSignal / strongestDownsizingSignal and the top signal arrays.
- Explain peopleImplication and suggestedHrbpAction in workforce planning, org design, hiring, ER, and change-management terms.
- Expansion & Downsizing Trends are NOT general market growth indicators. Do not classify generic product launches, token/fund/ETF milestones, AI product updates, HR education, or role-definition articles unless the item explicitly includes workforce/org/footprint change language (hiring/headcount, office/hub/entity setup, market entry/operations expansion, layoffs/redundancy/hiring freeze, restructuring/team consolidation/delayering).

Evidence quality (important when present):
- Some cleanedSignals may include an extra field "contentQuality" with one of: "full_text" | "rss_snippet" | "title_only".
- Treat "full_text" as strongest evidence, "rss_snippet" as medium evidence, and "title_only" as weak evidence.
- If you rely on weak evidence, explicitly say that some signals are based on limited metadata because full text was unavailable, and avoid inventing details beyond the provided text.

Shape (exact keys, exact types):

1) executiveSummary: string — 4–6 sentences. Must explicitly connect: (a) Web3/AI market signals, (b) HRBP implications, (c) job opportunities (from jobOpportunityDefaults if any), (d) skills/learning priorities implied by signals. Executive, concrete, no filler.

2) marketBriefs: array of EXACTLY 2 objects, in this order:
   - [0] { "category": "web3_ai", "headline": string, "keySignals": array }
   - [1] { "category": "hrbp", "headline": string, "keySignals": array }
   Each keySignals item MUST be an object with ALL of these string fields:
   title, sourceName, sourceUrl, whyItMatters, hrbpImplication, recommendedAction
   Optional: whatHappened (string) — factual "what changed" from the signal; if absent, the reader may treat title as the anchor.
   Map each item from cleanedSignals where category fits: use the signal's "url" as sourceUrl when present; otherwise "".
   Do not invent URLs.

3) employmentLaw: object {
     headline: string,
     disclaimer: string (must state not legal advice / HRBP implications only),
     items: array (0–4) of objects with REQUIRED strings:
       title, sourceName, sourceUrl, whatChanged, whyItMatters, hrbpImplication, suggestedAction
     Optional per item: jurisdiction (string), lawTheme (string), whyItQualifies (string), confidence ("high"|"medium"|"low").
     If items is empty, headline must say no strong employment law update was found in this run.
   }

4) expansionDownsizing: object {
     expansionCount: number (non-negative integer),
     downsizingCount: number (non-negative integer),
     restructuringCount: number (non-negative integer),
     expansionSummary: string,
     downsizingSummary: string,
     restructuringSummary: string (use "" if none),
     strongestSignal: string (legacy; strongest overall workforce-move headline),
     strongestExpansionSignal: string,
     strongestDownsizingSignal: string (downsizing or headcount/restructuring headline when that side leads),
     topExpansionSignals: array of at most 2 objects { title: string, sourceUrl: string, optional sourceName: string } drawn from cleanedSignals URLs only,
     topDownsizingRestructureSignals: array of at most 2 objects same shape, prioritising downsizing then restructuring narratives,
     peopleImplication: string,
     suggestedHrbpAction: string,
     sourceUrls: string[] (URLs from signals only; may be empty)
   }

5) jobOpportunities: array of HistoricalJobLink objects.
   Prefer adapting entries from jobOpportunityDefaults when provided (preserve real applyUrl values).
   Never fabricate applyUrl. If jobOpportunityDefaults is empty, use [].
   Each HistoricalJobLink MUST have:
   id, role, company, location, source, applyUrl, dateFound, fitScore (number),
   applicationStatus one of: "To Review", "Interested", "Applied", "Rejected", "Archived",
   whyThisFits (string), gaps (array of strings), recommendedAction (string), optional notes (string).

6) needsManualReview: array of { id, roleHint, sourceName, reason } (sourceUrl/companyHint optional strings). Use [] if nothing needs review.

7) skillsToPickUp: array of { skill, priority, evidence, nextAction, relatedLearningAsset }.
   priority must be exactly one of: "High", "Medium", "Low". All fields strings.

8) suggestedNewChannels: array of EXACTLY 2 or 3 objects. Each MUST have:
   id, channelName, channelType, url, reasonToAdd, expectedSignal, priority, status
   channelType one of: "job_board", "company_careers", "linkedin_saved_search", "newsletter", "community", "manual"
   priority: "High" | "Medium" | "Low"
   status must be exactly "Suggested"

9) learningAssetRecommendations: array of EXACTLY 2 or 3 objects. Each MUST have:
   topic, recommendedAsset, format, reason, nextAction
   format must be exactly one of: "PPT", "One-pager", "Framework", "Skill File", "Brief"
   Optional: linkedSkill (string) when clearly tied to a skillsToPickUp.skill.

Use weeklyPattern when non-empty to enrich "this week" narrative fields inside executiveSummary or market briefs — do not invent historical facts beyond that string.`;
