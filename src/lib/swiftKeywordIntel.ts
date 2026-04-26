/**
 * Deterministic keyword intel for Employment Law and Expansion / Downsizing modules.
 * Delegates to `intelligenceTaxonomy` for precise classification — no invented legal updates.
 */

import type { EmploymentLawConfidence } from "@/lib/intelligenceTaxonomy";
import {
  classifyEmploymentLawSignal,
  downsizingSignalConfidence,
  expansionSignalConfidence,
  hasStrongExpansion,
  excludedGenericReason,
  qualifiesDownsizingSignal,
  qualifiesExpansionSignal,
  qualifiesRestructuringSignal,
} from "@/lib/intelligenceTaxonomy";

export type IntelSnippet = {
  title: string;
  summary: string;
  url?: string;
  jurisdiction?: string;
  lawTheme?: string;
  confidence?: EmploymentLawConfidence;
  /** Expansion / downsizing / restructuring rows */
  signalType?: "expansion" | "downsizing" | "restructuring" | "mixed";
  whyItQualifies?: string;
  hrbpImplication?: string;
  suggestedAction?: string;
  sourceName?: string;
};

function rowText(s: Record<string, unknown>, keys: string[]): string {
  return keys
    .map((k) => s[k])
    .filter((x): x is string => typeof x === "string")
    .join(" ");
}

function sourceNameOf(s: Record<string, unknown>): string {
  const n = s.source_name ?? s.sourceName;
  return typeof n === "string" ? n : "";
}

/** Employment law: taxonomy-qualified only (excludes crypto/securities-only items). */
export function extractEmploymentLawSnippets(
  rows: Array<Record<string, unknown>>,
  limit = 6,
): IntelSnippet[] {
  const out: IntelSnippet[] = [];
  const seen = new Set<string>();
  for (const s of rows) {
    const title = typeof s.title === "string" ? s.title : "";
    const summary = rowText(s, ["summary", "why_it_matters", "hrbp_implication", "category"]);
    const urlRaw = s.source_url ?? s.sourceUrl;
    const url = typeof urlRaw === "string" ? urlRaw.trim() : "";
    const q = classifyEmploymentLawSignal({
      title: title || "Signal",
      summary,
      sourceName: sourceNameOf(s),
      sourceUrl: url,
    });
    if (!q) continue;
    const key = `${q.title}|${q.url ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: q.title,
      summary: q.summary,
      url: q.url,
      jurisdiction: q.jurisdiction,
      lawTheme: q.lawTheme,
      confidence: q.confidence,
      whyItQualifies: q.whyItQualifies,
      hrbpImplication: q.hrbpImplication,
      suggestedAction: q.suggestedAction,
      sourceName: q.sourceName,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function blobForRow(s: Record<string, unknown>): { title: string; summary: string; blobLower: string } {
  const title = typeof s.title === "string" ? s.title : "";
  const summary = rowText(s, ["summary", "why_it_matters", "hrbp_implication", "category"]);
  const blobLower = `${title} ${summary}`.toLowerCase();
  return { title, summary, blobLower };
}

export type ExcludedCandidate = {
  title: string;
  url?: string;
  reason: string;
};

function urlFromRow(s: Record<string, unknown>): string | undefined {
  const urlRaw = s.source_url ?? s.sourceUrl;
  const url = typeof urlRaw === "string" ? urlRaw.trim() : "";
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** Expansion: strong workforce/footprint signals; not generic product-only launches. */
export function extractExpansionSnippets(
  rows: Array<Record<string, unknown>>,
  limit = 6,
): IntelSnippet[] {
  const out: IntelSnippet[] = [];
  const seen = new Set<string>();
  for (const s of rows) {
    const { title, summary, blobLower } = blobForRow(s);
    const exclusion = excludedGenericReason(blobLower);
    if (exclusion) continue;
    if (!qualifiesExpansionSignal(blobLower)) continue;
    if (qualifiesDownsizingSignal(blobLower) && !hasStrongExpansion(blobLower)) continue;
    const url = urlFromRow(s) ?? "";
    const key = `${title}|${url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const conf = expansionSignalConfidence(blobLower);
    out.push({
      title: title || "Signal",
      summary: summary.slice(0, 280) || "Expansion-oriented workforce or footprint signal.",
      url: url && /^https?:\/\//i.test(url) ? url : undefined,
      signalType: "expansion",
      confidence: conf,
      sourceName: sourceNameOf(s),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function extractExcludedExpansionCandidates(
  rows: Array<Record<string, unknown>>,
  limit = 8,
): ExcludedCandidate[] {
  const out: ExcludedCandidate[] = [];
  const seen = new Set<string>();
  for (const s of rows) {
    const { title, blobLower } = blobForRow(s);
    if (!title.trim()) continue;
    // Only consider candidates that look expansion-ish before exclusion/qualification.
    const candidate = /\b(expansion|growth|scaling|launch|opens?|opening|market entry|funding|raises)\b/i.test(blobLower);
    if (!candidate) continue;
    const reason = excludedGenericReason(blobLower);
    if (!reason) continue;
    const url = urlFromRow(s);
    const key = `${title}|${url ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url, reason });
    if (out.length >= limit) break;
  }
  return out;
}

/** Layoffs, redundancy, headcount cuts, hiring freezes. */
export function extractDownsizingSnippets(
  rows: Array<Record<string, unknown>>,
  limit = 6,
): IntelSnippet[] {
  const out: IntelSnippet[] = [];
  const seen = new Set<string>();
  for (const s of rows) {
    const { title, summary, blobLower } = blobForRow(s);
    const exclusion = excludedGenericReason(blobLower);
    if (exclusion) continue;
    if (!qualifiesDownsizingSignal(blobLower)) continue;
    const url = urlFromRow(s) ?? "";
    const key = `${title}|${url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: title || "Signal",
      summary: summary.slice(0, 280),
      url: url && /^https?:\/\//i.test(url) ? url : undefined,
      signalType: "downsizing",
      confidence: downsizingSignalConfidence(blobLower),
      sourceName: sourceNameOf(s),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function extractExcludedDownsizingCandidates(
  rows: Array<Record<string, unknown>>,
  limit = 8,
): ExcludedCandidate[] {
  const out: ExcludedCandidate[] = [];
  const seen = new Set<string>();
  for (const s of rows) {
    const { title, blobLower } = blobForRow(s);
    if (!title.trim()) continue;
    const candidate = /\b(layoffs?|redundan|job cuts?|hiring freeze|cost reduction|efficien|productivity drive)\b/i.test(
      blobLower,
    );
    if (!candidate) continue;
    const reason = excludedGenericReason(blobLower);
    if (!reason) continue;
    const url = urlFromRow(s);
    const key = `${title}|${url ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url, reason });
    if (out.length >= limit) break;
  }
  return out;
}

/** Reorganisation, transformation, cost programmes (may overlap downsizing). */
export function extractRestructuringSnippets(
  rows: Array<Record<string, unknown>>,
  limit = 6,
): IntelSnippet[] {
  const out: IntelSnippet[] = [];
  const seen = new Set<string>();
  for (const s of rows) {
    const { title, summary, blobLower } = blobForRow(s);
    const exclusion = excludedGenericReason(blobLower);
    if (exclusion) continue;
    if (!qualifiesRestructuringSignal(blobLower)) continue;
    const url = urlFromRow(s) ?? "";
    const key = `${title}|${url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: title || "Signal",
      summary: summary.slice(0, 280),
      url: url && /^https?:\/\//i.test(url) ? url : undefined,
      signalType: "restructuring",
      confidence: downsizingSignalConfidence(blobLower),
      sourceName: sourceNameOf(s),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function buildExpansionVsDownsizingTrend(
  expansionCount: number,
  downsizingCount: number,
  restructuringCount = 0,
): string {
  if (expansionCount === 0 && downsizingCount === 0 && restructuringCount === 0) {
    return "No qualified expansion vs downsizing / restructuring cluster in captured signals for this window.";
  }
  const r = restructuringCount > 0 ? `; restructuring-oriented mentions (${restructuringCount})` : "";
  if (expansionCount > downsizingCount && expansionCount > restructuringCount) {
    return `Expansion-qualified signals (${expansionCount}) led downsizing / headcount (${downsizingCount})${r}.`;
  }
  if (downsizingCount > expansionCount || restructuringCount > expansionCount) {
    return `Downsizing / restructuring signals (${downsizingCount} headcount-focused, ${restructuringCount} transformation-oriented) outweighed expansion (${expansionCount})${r}.`;
  }
  return `Expansion (${expansionCount}), downsizing (${downsizingCount}), and restructuring (${restructuringCount}) appeared at similar intensity in qualified signal text.`;
}

/** Count taxonomy themes across rows (weekly topThemes enrichment). */
export function countKeywordThemesInRows(rows: Array<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (k: string, n: number) => counts.set(k, (counts.get(k) ?? 0) + n);

  for (const s of rows) {
    const { title, summary, blobLower } = blobForRow(s);
    const blob = `${title} ${summary}`;
    if (!blob.trim()) continue;

    const el = classifyEmploymentLawSignal({
      title,
      summary,
      sourceName: sourceNameOf(s),
      sourceUrl: typeof (s.source_url ?? s.sourceUrl) === "string" ? String(s.source_url ?? s.sourceUrl) : "",
    });
    if (el) bump("employment law (qualified)", 1);

    if (qualifiesExpansionSignal(blobLower)) bump("expansion (qualified)", 1);
    if (qualifiesDownsizingSignal(blobLower)) bump("downsizing (qualified)", 1);
    if (qualifiesRestructuringSignal(blobLower)) bump("restructuring (qualified)", 1);

    if (/\blayoffs?\b/gi.test(blob)) bump("layoffs", (blob.match(/\blayoffs?\b/gi) ?? []).length);
    if (/\bentity setup\b/gi.test(blob)) bump("entity setup", 1);
    if (/\bworkforce planning\b/gi.test(blob)) bump("workforce planning", 1);
  }
  return counts;
}
