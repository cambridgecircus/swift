"use client";

import type { ReactNode } from "react";

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
  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition";

export default function Sidebar({
  active,
  onSelect,
  items,
}: {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  items: NavItem[];
}) {
  return (
    <aside className="sticky top-0 h-dvh w-full border-b border-white/10 bg-slate-950/60 backdrop-blur md:h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="flex h-full flex-col">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.25em] text-slate-400">
                SWIFT
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                Executive Console
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              v0.2
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold text-slate-200">
              Intelligence Loop
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Single-page mock shell. Data is staged; routing comes next.
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 pb-5">
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
                        ? "border border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                        : "text-slate-200 hover:bg-white/5 hover:text-white",
                    ].join(" ")}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-200">
                      {item.icon ?? (
                        <span className="text-[10px] font-bold tracking-wide">
                          {item.label.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isActive ? (
                      <span className="text-[11px] text-cyan-200">Active</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-5 pb-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold text-slate-200">
              Premium workspace
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Built for HRBP operators navigating Web3 x AI shifts.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

