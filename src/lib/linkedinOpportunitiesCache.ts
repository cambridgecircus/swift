import { fetchLinkedInJobAlertEmails, type LinkedInJobEmail } from "@/lib/gmailLinkedIn";

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

  console.info(`[LINKEDIN_CACHE] background refresh started reason=${reason}`);
  refreshInFlight = (async () => {
    try {
      const emails = await fetchLinkedInJobAlertEmails();
      cacheState = {
        emails,
        updatedAtMs: nowMs(),
      };
      console.info(`[LINKEDIN_CACHE] background refresh completed count=${emails.length}`);
    } catch (error) {
      console.error("[LINKEDIN_CACHE] background refresh failed", error);
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function clearLinkedInCacheForDebug(): void {
  cacheState = null;
}

export async function getLinkedInJobEmailsCached(options?: {
  forceRefresh?: boolean;
}): Promise<{ emails: LinkedInJobEmail[]; meta: LinkedInCacheMeta }> {
  const forceRefresh = Boolean(options?.forceRefresh);

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
