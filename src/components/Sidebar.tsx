"use client";

import type { ReactNode } from "react";

import { designTokens as dt } from "@/lib/designTokens";

export type NavKey =
  | "dashboard"
  | "jobOpportunities"
  | "skills"
  | "learningAssets"
  | "settings";

export type NavItem = {
  key: NavKey;
  label: string;
  icon?: ReactNode;
};

const baseItemClasses =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition";

function NavList({
  active,
  items,
  onSelect,
}: {
  active: NavKey;
  items: NavItem[];
  onSelect: (key: NavKey) => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              className={[
                baseItemClasses,
                isActive
                  ? `${dt.accentBorder} ${dt.accentSoftBg} text-cyan-100`
                  : "text-slate-200 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg ${dt.border} bg-white/5 text-slate-200`}
              >
                {item.icon ?? (
                  <span className="text-[10px] font-bold tracking-wide">
                    {item.label.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {isActive ? (
                <span className={`text-[11px] ${dt.accentText}`}>Active</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarInner({
  active,
  items,
  onSelect,
  onCloseMobile,
  showCloseButton,
}: {
  active: NavKey;
  items: NavItem[];
  onSelect: (key: NavKey) => void;
  onCloseMobile?: () => void;
  showCloseButton?: boolean;
}) {
  const handleSelect = (key: NavKey) => {
    onSelect(key);
    onCloseMobile?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-xs font-semibold tracking-[0.25em] ${dt.muted}`}>SWIFT</p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-100">
              Executive Console
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={`rounded-full ${dt.border} bg-white/5 px-3 py-1 text-[11px] text-slate-300`}
            >
              v0.2
            </div>
            {showCloseButton ? (
              <button
                type="button"
                onClick={onCloseMobile}
                className={`rounded-lg ${dt.border} px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5`}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
        <div className={`mt-4 ${dt.cardRadius} ${dt.border} bg-white/5 p-3`}>
          <p className="text-xs font-semibold text-slate-200">Intelligence Loop</p>
          <p className={`mt-1 text-xs leading-5 ${dt.muted}`}>
            Single-page mock shell. Data is staged; routing comes next.
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-5">
        <NavList active={active} items={items} onSelect={handleSelect} />
      </nav>

      <div className="px-5 pb-6">
        <div className={`${dt.cardRadius} ${dt.border} bg-white/5 p-4`}>
          <p className="text-xs font-semibold text-slate-200">Premium workspace</p>
          <p className={`mt-1 text-xs leading-5 ${dt.muted}`}>
            Built for HRBP operators navigating Web3 x AI shifts.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  active,
  onSelect,
  items,
  mobileOpen,
  onMobileClose,
}: {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  items: NavItem[];
  /** When true, mobile drawer is visible (md and up ignores this). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Desktop: sticky rail */}
      <aside
        className={`relative hidden h-screen w-72 shrink-0 border-r ${dt.border} bg-slate-950/70 backdrop-blur md:flex`}
      >
        <SidebarInner active={active} items={items} onSelect={onSelect} />
      </aside>

      {/* Mobile: overlay drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside
            className={`absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] max-w-full flex-col ${dt.border} border-r bg-slate-950 shadow-2xl`}
          >
            <SidebarInner
              active={active}
              items={items}
              onSelect={onSelect}
              onCloseMobile={onMobileClose}
              showCloseButton
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
