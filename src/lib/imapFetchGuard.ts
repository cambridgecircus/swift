type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const inFlightByKey = new Map<string, Promise<unknown>>();
const cacheByKey = new Map<string, CacheEntry<unknown>>();

export async function runGuardedFetch<T>(args: {
  key: string;
  run: () => Promise<T>;
  fallback: () => T;
  logPrefix: string;
}): Promise<T> {
  const active = inFlightByKey.get(args.key) as Promise<T> | undefined;
  if (active) {
    const cached = cacheByKey.get(args.key) as CacheEntry<T> | undefined;
    if (cached) {
      console.warn(
        `${args.logPrefix} fetch already in progress; returning cached result from ${new Date(cached.updatedAt).toISOString()}`,
      );
      return cached.value;
    }
    console.warn(`${args.logPrefix} fetch already in progress; returning fallback`);
    return args.fallback();
  }

  const task = (async () => {
    const result = await args.run();
    cacheByKey.set(args.key, { value: result, updatedAt: Date.now() });
    return result;
  })();

  inFlightByKey.set(args.key, task);
  try {
    return await task;
  } finally {
    inFlightByKey.delete(args.key);
  }
}
