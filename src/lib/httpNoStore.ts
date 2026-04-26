/** Headers for API responses that must reflect latest server state. */
export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
};

export function jsonResponseNoStore(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(NO_STORE_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return Response.json(body, { ...init, headers });
}
