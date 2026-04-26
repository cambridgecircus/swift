import { sourceRegistry } from "@/lib/sourceRegistry";
import type { SourceRegistryItem, SourceTopic, SourceType } from "@/lib/types";

export type SourceRegistrySummary = {
  totalSources: number;
  enabledSources: number;
  rssEnabled: number;
  apiPlanned: number;
  jsonPlanned: number;
  manualPlanned: number;
  byTopic: Record<string, number>;
  byType: Record<string, number>;
  enabledSourceNames: string[];
  disabledSourceNames: string[];
  /** Post-ingest signal classification (feeds are topic-tagged; law/expansion rules apply to text). */
  signalClassification: {
    taxonomyModulePath: string;
    notes: string;
  };
};

function bump(map: Record<string, number>, key: string, inc = 1) {
  map[key] = (map[key] ?? 0) + inc;
}

function toByTopic(items: SourceRegistryItem[]): Record<SourceTopic, number> {
  const out = { web3: 0, ai: 0, hr: 0, jobs: 0, learning: 0 } satisfies Record<SourceTopic, number>;
  for (const s of items) out[s.topic] = (out[s.topic] ?? 0) + 1;
  return out;
}

function toByType(items: SourceRegistryItem[]): Record<SourceType, number> {
  const out = {
    rss: 0,
    json_feed: 0,
    api: 0,
    website: 0,
    newsletter: 0,
    job_board: 0,
    manual: 0,
    email_alert: 0,
  } satisfies Record<SourceType, number>;
  for (const s of items) out[s.sourceType] = (out[s.sourceType] ?? 0) + 1;
  return out;
}

/**
 * Executive summary of the curated source registry.
 * Pure, deterministic, and safe to expose (contains no secrets).
 */
export function getSourceRegistrySummary(): SourceRegistrySummary {
  const totalSources = sourceRegistry.length;
  const enabled = sourceRegistry.filter((s) => s.enabled);
  const enabledSources = enabled.length;
  const rssEnabled = enabled.filter((s) => s.sourceType === "rss").length;

  // Planned = disabled sources, grouped by access / type intent.
  const disabled = sourceRegistry.filter((s) => !s.enabled);
  const apiPlanned = disabled.filter((s) => s.sourceType === "api").length;
  const jsonPlanned = disabled.filter((s) => s.sourceType === "json_feed").length;
  const manualPlanned = disabled.filter(
    (s) => s.sourceType === "manual" || s.accessType === "manual_review",
  ).length;

  const byTopic = toByTopic(sourceRegistry);
  const byType = toByType(sourceRegistry);

  const enabledSourceNames = enabled.map((s) => s.name).sort((a, b) => a.localeCompare(b));
  const disabledSourceNames = disabled.map((s) => s.name).sort((a, b) => a.localeCompare(b));

  // Ensure plain JSON (no undefined).
  const byTopicJson: Record<string, number> = {};
  const byTypeJson: Record<string, number> = {};
  for (const [k, v] of Object.entries(byTopic)) bump(byTopicJson, k, v);
  for (const [k, v] of Object.entries(byType)) bump(byTypeJson, k, v);

  return {
    totalSources,
    enabledSources,
    rssEnabled,
    apiPlanned,
    jsonPlanned,
    manualPlanned,
    byTopic: byTopicJson,
    byType: byTypeJson,
    enabledSourceNames,
    disabledSourceNames,
    signalClassification: {
      taxonomyModulePath: "src/lib/intelligenceTaxonomy.ts",
      notes:
        "Employment law and expansion/downsizing/restructuring matches use intelligenceTaxonomy + swiftKeywordIntel on ingested titles/summaries; pure crypto/securities items are excluded from employment law unless workforce-linked.",
    },
  };
}

