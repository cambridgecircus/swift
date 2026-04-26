/**
 * This file centralises SWIFT visual choices so colours, spacing and radius can be changed without hunting through every component.
 *
 * Usage: import { designTokens as dt } from "@/lib/designTokens" and compose className strings (Tailwind JIT needs static-looking literals).
 */

export const designTokens = {
  /** Full-page canvas */
  pageBg:
    "min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white antialiased",

  /** Subtle panel behind main column (optional strip) */
  panelBg: "bg-slate-950/50",

  /** Primary elevated cards */
  cardBg: "bg-white/[0.045] shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",

  /** Inset / nested blocks inside cards */
  cardInset: "bg-slate-950/45",

  /** Default hairline border */
  border: "border border-white/10",

  /** Accent (links, highlights) */
  accentText: "text-cyan-200",
  accentTextHover: "hover:text-cyan-100",
  accentBorder: "border-cyan-300/35",
  accentSoftBg: "bg-cyan-300/10",

  /** Primary CTA fill */
  accentButton:
    "rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/80 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-cyan-300",

  /** Secondary / muted copy */
  muted: "text-slate-400",

  /** Spacing inside cards */
  cardPadding: "p-5 sm:p-6",

  /** Corner radius for cards */
  cardRadius: "rounded-2xl",

  /** Max width for the app shell (wide so Settings tables breathe on desktop) */
  maxContent: "max-w-[min(100%,88rem)]",

  /** Main column horizontal padding */
  mainPadX: "px-4 sm:px-6 md:px-10",

  /** Main column vertical padding */
  mainPadY: "py-6 md:py-10",

  /** Mobile top bar */
  mobileHeader:
    "sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur-md md:hidden",
} as const;
