/**
 * SWIFT executive theme: near-black surfaces, hot pink as lead accent, cyan + violet
 * as supporting accents. No third-party branding in UI.
 *
 * `swiftPalette` documents hex targets; runtime colors use `--swift-*` in globals.css.
 */

export const swiftPalette = {
  backgroundBase: "#050507",
  backgroundPanel: "#0B0D14",
  backgroundCard: "#11131C",
  backgroundElevated: "#151826",
  borderSubtle: "rgba(255,255,255,0.10)",
  textPrimary: "#F5F7FA",
  textSecondary: "#A7B0C0",
  textMuted: "#7D8798",
  accentPink: "#FE2C55",
  accentPinkStrong: "#FF3B7A",
  accentPinkGlow: "rgba(254,44,85,0.28)",
  accentCyan: "#25F4EE",
  accentCyanGlow: "rgba(37,244,238,0.16)",
  accentViolet: "#7C5CFF",
  accentVioletGlow: "rgba(124,92,255,0.16)",
  statusLive: "#22C55E",
  statusWarning: "#F59E0B",
} as const;

const r = "rounded-2xl";

export const designTokens = {
  pageBg:
    "min-h-screen bg-transparent text-[color:var(--swift-text-primary)] antialiased",

  panelBg: "bg-[color:var(--swift-bg-panel)]",

  /** Default cards — restrained; pink only as ultra-soft outer wash */
  cardBg:
    "bg-[color:var(--swift-bg-card)] shadow-[0_0_0_1px_rgba(254,44,85,0.04),0_0_48px_-28px_rgba(254,44,85,0.1),0_0_56px_-32px_rgba(124,92,255,0.06)]",

  /** Curated insight strips (brief columns) — pink + violet frame */
  cardInsightExtra: [
    "border-[color:rgba(254,44,85,0.22)]",
    "shadow-[inset_0_1px_0_0_rgba(254,44,85,0.32),0_0_0_1px_rgba(124,92,255,0.1),0_0_40px_-14px_rgba(254,44,85,0.18),0_0_48px_-20px_rgba(124,92,255,0.12)]",
  ].join(" "),

  /** AI / generated / strategic modules — stacks on `cardBg` (border + glow only) */
  cardAiModule: [
    "border-[color:rgba(254,44,85,0.28)]",
    "shadow-[inset_0_1px_0_0_rgba(254,44,85,0.35),0_0_0_1px_rgba(124,92,255,0.1),0_0_44px_-16px_rgba(254,44,85,0.2),0_0_56px_-24px_rgba(124,92,255,0.12)]",
  ].join(" "),

  cardInset: "bg-[color:var(--swift-bg-card-inset)]",

  /**
   * Nested surface hierarchy:
   * - Level 1: main cards (InfoCard)
   * - Level 2: nested panels / accordion rows / details bodies
   * - Level 3: compact chips / meta pills (Pill already covers most)
   */
  nestedPanel: [
    r,
    "border border-[color:rgba(255,255,255,0.09)]",
    "bg-[linear-gradient(180deg,rgba(21,24,38,0.62),rgba(17,19,28,0.62))]",
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(254,44,85,0.04),0_0_34px_-22px_rgba(124,92,255,0.10)]",
  ].join(" "),

  nestedPanelHover:
    "transition hover:border-[color:rgba(37,244,238,0.22)] hover:bg-[linear-gradient(180deg,rgba(21,24,38,0.68),rgba(17,19,28,0.66))]",

  detailsPanel: [
    r,
    "border border-[color:rgba(255,255,255,0.09)]",
    "bg-[rgba(5,5,7,0.35)]",
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
  ].join(" "),

  rowButton:
    "w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgba(37,244,238,0.28)]",

  labelCaps: "text-[11px] font-semibold uppercase tracking-wide text-slate-400",

  metaMuted: "text-xs text-[color:var(--swift-text-secondary)]",

  subtleDivider: "border-t border-[color:rgba(255,255,255,0.10)]",

  border: "border border-[color:var(--swift-border-subtle)]",

  textPrimary: "text-[color:var(--swift-text-primary)]",

  muted: "text-[color:var(--swift-text-secondary)]",

  textMuted: "text-[color:var(--swift-text-muted)]",

  /** Links — cyan for scanability; hover picks up pink micro-glow */
  accentText: "text-[color:var(--swift-accent-cyan)]",
  accentTextHover:
    "hover:text-[color:var(--swift-text-primary)] hover:drop-shadow-[0_0_14px_rgba(254,44,85,0.22)]",

  accentBorder: "border-[color:rgba(254,44,85,0.38)]",
  accentSoftBg: "bg-[rgba(254,44,85,0.08)]",

  /** Main dashboard CTA — pink → violet, white label */
  primaryCta: [
    r,
    "inline-flex min-h-[2.75rem] items-center justify-center bg-gradient-to-r",
    "from-[color:var(--swift-accent-pink)] via-[color:var(--swift-accent-pink-strong)] to-[color:var(--swift-accent-violet)]",
    "px-4 py-2.5 text-sm font-semibold text-white tracking-tight",
    "shadow-[0_4px_28px_-6px_rgba(254,44,85,0.45),0_8px_32px_-10px_rgba(124,92,255,0.25)]",
    "transition hover:brightness-[1.06] hover:shadow-[0_6px_36px_-4px_rgba(254,44,85,0.5),0_10px_40px_-8px_rgba(124,92,255,0.28)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgba(254,44,85,0.55)]",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:hover:shadow-none",
  ].join(" "),

  resetMuted:
    "self-start text-left text-xs font-medium text-[color:var(--swift-text-muted)] underline decoration-[color:rgba(125,135,152,0.35)] underline-offset-2 transition hover:text-[color:var(--swift-accent-pink-strong)] hover:decoration-[color:rgba(254,44,85,0.45)]",

  /** Live / on / enabled — status green */
  pillStatusLive:
    "border-[color:rgba(34,197,94,0.42)] bg-[rgba(34,197,94,0.1)] text-[color:var(--swift-status-live)]",

  /** AI-ranked, generated, intelligence window */
  pillAi:
    "border-[color:rgba(254,44,85,0.42)] bg-[rgba(254,44,85,0.1)] text-[color:var(--swift-accent-pink-strong)]",

  pillWarning:
    "border-[color:rgba(245,158,11,0.38)] bg-[rgba(245,158,11,0.1)] text-[color:var(--swift-status-warning)]",

  pillNeutral:
    "border-[color:var(--swift-border-subtle)] bg-[rgba(21,24,38,0.72)] text-[color:var(--swift-text-secondary)]",

  /** High priority / strong emphasis */
  pillAccent:
    "border-[color:rgba(254,44,85,0.48)] bg-[linear-gradient(135deg,rgba(254,44,85,0.16),rgba(124,92,255,0.1))] text-[color:var(--swift-text-primary)]",

  /** Fit / score */
  pillFit:
    "border-[color:rgba(254,44,85,0.42)] bg-[rgba(5,5,7,0.4)] text-[color:var(--swift-text-primary)]",

  metricStatCard: [
    r,
    "border border-[color:var(--swift-border-subtle)] bg-[color:var(--swift-bg-card-inset)] p-4 sm:p-5",
    "border-l-[3px] border-l-[color:rgba(254,44,85,0.55)]",
    "shadow-[inset_0_0_0_1px_rgba(254,44,85,0.06),0_0_32px_-18px_rgba(254,44,85,0.16),0_0_40px_-22px_rgba(124,92,255,0.08)]",
  ].join(" "),

  metricValue: [
    "text-white text-3xl font-semibold tabular-nums tracking-tight",
    "[text-shadow:0_0_28px_rgba(254,44,85,0.18),0_0_20px_rgba(37,244,238,0.08)]",
  ].join(" "),

  metricValueLg: [
    "text-white text-2xl font-semibold tracking-tight",
    "[text-shadow:0_0_22px_rgba(254,44,85,0.16)]",
  ].join(" "),

  /** Primary job action — pink-led */
  applyButtonPrimary:
    "border border-[color:rgba(254,44,85,0.48)] bg-[rgba(254,44,85,0.12)] text-[color:var(--swift-text-primary)] hover:bg-[rgba(254,44,85,0.18)] hover:shadow-[0_0_20px_-8px_rgba(254,44,85,0.35)]",

  /** Secondary — cyan supporting outline */
  applyButtonSecondary:
    "border border-[color:rgba(37,244,238,0.28)] bg-[rgba(5,5,7,0.5)] text-[color:var(--swift-text-primary)] hover:border-[color:rgba(37,244,238,0.42)] hover:bg-[rgba(37,244,238,0.06)]",

  /** AI / SWIFT-ranked priority ribbon */
  scoreChipAi:
    "rounded-full border border-[color:rgba(254,44,85,0.4)] bg-[rgba(254,44,85,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--swift-accent-pink-strong)]",

  skillTag:
    "rounded-full border border-[color:rgba(124,92,255,0.32)] bg-[rgba(124,92,255,0.08)] px-2.5 py-1 text-[11px] text-[color:var(--swift-accent-violet)]",

  secondaryChip:
    "rounded-full border border-[color:var(--swift-border-subtle)] bg-[rgba(21,24,38,0.65)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--swift-text-secondary)]",

  sidebarShell:
    "border-[color:var(--swift-border-subtle)] bg-[color:var(--swift-bg-panel)] backdrop-blur-xl",

  sidebarNavActive: [
    "border border-[color:rgba(254,44,85,0.45)]",
    "bg-gradient-to-r from-[rgba(254,44,85,0.12)] to-[rgba(124,92,255,0.1)]",
    "text-[color:var(--swift-text-primary)]",
    "shadow-[0_0_28px_-12px_rgba(254,44,85,0.35),inset_0_1px_0_0_rgba(124,92,255,0.18)]",
  ].join(" "),

  sidebarNavIdle:
    "border border-transparent text-[color:var(--swift-text-secondary)] hover:border-[color:rgba(254,44,85,0.18)] hover:bg-[rgba(254,44,85,0.04)] hover:text-[color:var(--swift-text-primary)]",

  sidebarIconChip:
    "grid h-8 w-8 place-items-center rounded-lg border border-[color:var(--swift-border-subtle)] bg-[rgba(255,255,255,0.03)] text-[color:var(--swift-text-secondary)]",

  sidebarIconChipActive: [
    "grid h-8 w-8 place-items-center rounded-lg",
    "border border-[color:rgba(254,44,85,0.5)] bg-[rgba(254,44,85,0.12)]",
    "text-[color:var(--swift-accent-pink-strong)]",
    "shadow-[0_0_18px_-6px_rgba(254,44,85,0.45)]",
  ].join(" "),

  navActiveLabel: "text-[11px] font-medium text-[color:var(--swift-accent-pink-strong)]",

  accentButton: [
    r,
    "bg-gradient-to-r from-[color:var(--swift-accent-pink)] to-[color:var(--swift-accent-violet)]",
    "px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_24px_-6px_rgba(254,44,85,0.45)]",
    "transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-[color:rgba(254,44,85,0.55)] disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),

  cardPadding: "p-5 sm:p-6",

  cardRadius: r,

  maxContent: "max-w-[min(100%,88rem)]",

  mainPadX: "px-4 sm:px-6 md:px-10",

  mainPadY: "py-6 md:py-10",

  mobileHeader:
    "sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[color:var(--swift-border-subtle)] bg-[color:rgba(11,13,20,0.94)] px-4 py-3 backdrop-blur-md md:hidden",
} as const;
