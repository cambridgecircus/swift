"use client";

import { useState } from "react";

import { designTokens as dt } from "@/lib/designTokens";

type KeySignal = {
  title: string;
  source: string;
  implication: string;
};

type Report = {
  generatedAt: string;
  headline: string;
  executiveSummary: string;
  keySignals: KeySignal[];
  hrbpRecommendations: string[];
};

export default function ReportGenerator() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateReport() {
    setLoading(true);

    try {
      const response = await fetch("/api/generate-report", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error(error);
      alert("Failed to generate report. Please check the terminal logs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={`mt-8 ${dt.cardRadius} ${dt.border} border-[color:var(--swift-border-subtle)] ${dt.cardBg} p-6 shadow-[0_0_40px_-24px_rgba(37,244,238,0.2)]`}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className={`text-2xl font-semibold ${dt.textPrimary}`}>Latest Intelligence Report</h2>
          <p className={`mt-2 text-sm ${dt.muted}`}>
            Click the button to generate a fresh report preview.
          </p>
        </div>

        <button
          onClick={generateReport}
          disabled={loading}
          type="button"
          className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${dt.accentButton}`}
        >
          {loading ? "Generating..." : "Generate Latest Report"}
        </button>
      </div>

      {report ? (
        <div
          className={`mt-6 ${dt.cardRadius} ${dt.border} border-[color:var(--swift-border-subtle)] bg-[color:rgba(11,13,24,0.72)] p-6`}
        >
          <p className={`text-sm font-medium ${dt.accentText}`}>
            Generated at {new Date(report.generatedAt).toLocaleString()}
          </p>

          <h3 className={`mt-4 text-xl font-semibold ${dt.textPrimary}`}>{report.headline}</h3>

          <p className={`mt-4 text-sm leading-6 ${dt.muted}`}>
            {report.executiveSummary}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {report.keySignals.map((signal) => (
              <div
                key={signal.title}
                className={`rounded-xl border border-[color:var(--swift-border-subtle)] bg-[rgba(17,19,34,0.5)] p-4`}
              >
                <p className={`text-xs uppercase tracking-wide ${dt.muted}`}>
                  {signal.source}
                </p>
                <p className={`mt-2 text-sm font-semibold ${dt.textPrimary}`}>
                  {signal.title}
                </p>
                <p className={`mt-2 text-sm ${dt.muted}`}>
                  {signal.implication}
                </p>
              </div>
            ))}
          </div>

          <div
            className={`mt-6 rounded-xl border border-[color:var(--swift-border-subtle)] bg-[rgba(17,19,34,0.45)] p-4`}
          >
            <p className={`text-xs uppercase tracking-wide ${dt.muted}`}>
              HRBP recommendations
            </p>
            <ul className={`mt-3 list-disc space-y-2 pl-5 text-sm ${dt.muted}`}>
              {report.hrbpRecommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div
          className={`mt-6 ${dt.cardRadius} ${dt.border} border-[color:var(--swift-border-subtle)] bg-[color:rgba(11,13,24,0.72)] p-6`}
        >
          <p className={`text-sm font-medium ${dt.accentText}`}>No report generated yet</p>
          <p className={`mt-3 text-sm ${dt.muted}`}>
            Click the button above to call your first SWIFT report API.
          </p>
        </div>
      )}
    </section>
  );
}
