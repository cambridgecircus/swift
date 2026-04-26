import type { LearningAsset } from "@/lib/mockData";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

export default function LearningAssetCard({ asset }: { asset: LearningAsset }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">
            {asset.topic}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{asset.purpose}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{asset.priority} priority</Pill>
          <Pill>{asset.status}</Pill>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Market demand score
          </dt>
          <dd className="mt-1 text-sm font-semibold text-slate-100">
            {asset.marketDemandScore}/100
          </dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Trend
          </dt>
          <dd className="mt-1 text-sm font-semibold text-slate-100">
            {asset.trend}
          </dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 md:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Planned asset
          </dt>
          <dd className="mt-1 text-sm text-slate-200">{asset.plannedAsset}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 md:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Next action
          </dt>
          <dd className="mt-1 text-sm text-slate-200">{asset.nextAction}</dd>
        </div>
      </dl>
    </article>
  );
}

