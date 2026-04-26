/** Hostnames that indicate mock / documentation URLs, not real application flows. */
const PLACEHOLDER_HOSTNAMES = new Set([
  "example.com",
  "example.org",
  "example.net",
]);

/**
 * Returns true only when `url` is an http(s) URL on a non-placeholder host.
 * Used to avoid presenting mock apply links as real applications.
 */
export function isRealJobApplyUrl(url: string | undefined | null): boolean {
  if (url == null || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/placeholder/i.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  for (const h of PLACEHOLDER_HOSTNAMES) {
    if (host === h || host.endsWith(`.${h}`)) return false;
  }

  return true;
}
