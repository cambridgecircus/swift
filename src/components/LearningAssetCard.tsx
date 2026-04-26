import type { LearningAsset } from "@/lib/mockData";
import { designTokens as dt } from "@/lib/designTokens";
import { MetricTile, NestedPanel, StatusBadge } from "@/components/DashboardPrimitives";

export default function LearningAssetCard({ asset }: { asset: LearningAsset }) {
  return (
    <NestedPanel className={`${dt.nestedPanelHover}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${dt.textPrimary}`}>{asset.topic}</p>
          <p className={`mt-1 text-xs leading-relaxed ${dt.muted}`}>{asset.purpose}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="warning">{asset.priority} priority</StatusBadge>
          <StatusBadge>{asset.status}</StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricTile label="Market demand score" value={`${asset.marketDemandScore}/100`} />
        <MetricTile label="Trend" value={asset.trend} />
      </div>

      <div className="mt-4 grid gap-3">
        <div className={`${dt.detailsPanel} p-4 sm:p-5`}>
          <p className={dt.labelCaps}>Planned asset</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{asset.plannedAsset}</p>
        </div>
        <div className={`${dt.detailsPanel} p-4 sm:p-5`}>
          <p className={dt.labelCaps}>Next action</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{asset.nextAction}</p>
        </div>
      </div>
    </NestedPanel>
  );
}

