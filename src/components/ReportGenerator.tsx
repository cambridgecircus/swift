"use client";

import { useState } from "react";

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
    <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-semibold">Latest Intelligence Report</h2>
          <p className="mt-2 text-sm text-slate-300">
            Click the button to generate a fresh report preview.
          </p>
        </div>

        <button
          onClick={generateReport}
          disabled={loading}
          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate Latest Report"}
        </button>
      </div>

      {report ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-6">
          <p className="text-sm font-medium text-cyan-300">
            Generated at {new Date(report.generatedAt).toLocaleString()}
          </p>

          <h3 className="mt-4 text-xl font-semibold">{report.headline}</h3>

          <p className="mt-4 text-sm leading-6 text-slate-300">
            {report.executiveSummary}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {report.keySignals.map((signal) => (
              <div key={signal.title} className="rounded-xl bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {signal.source}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-100">
                  {signal.title}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {signal.implication}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              HRBP recommendations
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
              {report.hrbpRecommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-6">
          <p className="text-sm font-medium text-cyan-300">
            No report generated yet
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Click the button above to call your first SWIFT report API.
          </p>
        </div>
      )}
    </section>
  );
}
