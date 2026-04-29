import { fetchLinkedInJobAlertEmails, type LinkedInImapDiagnostics, type LinkedInJobEmail } from "@/lib/gmailLinkedIn";

const LINKEDIN_CACHE_TTL_MS = 20 * 60 * 1000;

type LinkedInCacheState = {
  emails: LinkedInJobEmail[];
  updatedAtMs: number;
};

type CacheReason = "cache_hit" | "cache_miss" | "cache_expired";

export type LinkedInCacheMeta = {
  reason: CacheReason;
  isRefreshing: boolean;
  hasCachedValue: boolean;
  lastUpdatedAt: string | null;
  ttlMs: number;
  error?: string;
  errorDiagnostics?: LinkedInImapDiagnostics;
};

let cacheState: LinkedInCacheState | null = null;
let refreshInFlight: Promise<void> | null = null;

function nowMs(): number {
  return Date.now();
}

function isFresh(state: LinkedInCacheState): boolean {
  return nowMs() - state.updatedAtMs < LINKEDIN_CACHE_TTL_MS;
}

function cacheMeta(reason: CacheReason): LinkedInCacheMeta {
  return {
    reason,
    isRefreshing: Boolean(refreshInFlight),
    hasCachedValue: Boolean(cacheState),
    lastUpdatedAt: cacheState ? new Date(cacheState.updatedAtMs).toISOString() : null,
    ttlMs: LINKEDIN_CACHE_TTL_MS,
  };
}

async function refreshCache(reason: "expired" | "miss" | "manual"): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  console.info(`[LINKEDIN_CACHE] Gmail fetch started reason=${reason}`);
  refreshInFlight = (async () => {
    try {
      const emails = await fetchLinkedInJobAlertEmails({
        throwOnError: reason === "manual",
      });
      cacheState = {
        emails,
        updatedAtMs: nowMs(),
      };
      console.info(`[LINKEDIN_CACHE] Gmail fetch completed count=${emails.length}`);
    } catch (error) {
      console.error("[LINKEDIN_CACHE] background refresh failed", error);
      if (reason === "manual") {
        throw error;
      }
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function getMissingLinkedInEnvVarNames(): string[] {
  const required = ["GMAIL_USER", "GMAIL_APP_PASSWORD"] as const;
  return required.filter((name) => !process.env[name] || !String(process.env[name]).trim());
}

export function clearLinkedInCacheForDebug(): void {
  cacheState = null;
}

export async function getLinkedInJobEmailsCached(options?: {
  forceRefresh?: boolean;
  awaitRefresh?: boolean;
}): Promise<{ emails: LinkedInJobEmail[]; meta: LinkedInCacheMeta }> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const awaitRefresh = Boolean(options?.awaitRefresh);

  if (forceRefresh && awaitRefresh) {
    const missingEnv = getMissingLinkedInEnvVarNames();
    if (missingEnv.length > 0) {
      const error = `Missing required Gmail env vars: ${missingEnv.join(", ")}`;
      console.warn(`[LINKEDIN_CACHE] manual refresh blocked ${error}`);
      return {
        emails: cacheState?.emails ?? [],
        meta: { ...cacheMeta(cacheState ? "cache_expired" : "cache_miss"), error },
      };
    }
    try {
      console.info("[LINKEDIN_CACHE] manual refresh started (awaiting)");
      await refreshCache("manual");
      return {
        emails: cacheState?.emails ?? [],
        meta: { ...cacheMeta(cacheState ? "cache_hit" : "cache_miss"), error: undefined },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Manual refresh failed";
      const diag = (error as any)?.imapDiagnostics as LinkedInImapDiagnostics | undefined;
      if (diag) {
        console.error("[LINKEDIN_CACHE] manual refresh failed diagnostics", diag);
      } else {
        console.error("[LINKEDIN_CACHE] manual refresh failed", error);
      }
      return {
        emails: cacheState?.emails ?? [],
        meta: {
          ...cacheMeta(cacheState ? "cache_expired" : "cache_miss"),
          error: message,
          errorDiagnostics: diag,
        },
      };
    }
  }

  if (cacheState && isFresh(cacheState) && !forceRefresh) {
    console.info("[LINKEDIN_CACHE] cache hit");
    return { emails: cacheState.emails, meta: cacheMeta("cache_hit") };
  }

  if (!cacheState) {
    console.info("[LINKEDIN_CACHE] cache miss");
    void refreshCache(forceRefresh ? "manual" : "miss");
    return { emails: [], meta: cacheMeta("cache_miss") };
  }

  console.info("[LINKEDIN_CACHE] cache expired");
  void refreshCache(forceRefresh ? "manual" : "expired");
  return { emails: cacheState.emails, meta: cacheMeta("cache_expired") };
}
