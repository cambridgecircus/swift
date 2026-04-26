import { ingestLinkedInJobAlerts } from "@/lib/linkedinJobAlertIngestion";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.LINKEDIN_JOB_ALERT_INGEST_SECRET?.trim();
  if (!secret) {
    return Response.json({ status: "error", message: "Ingest is not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ status: "error", message: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ status: "error", message: "Body must be an object" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const source = typeof o.source === "string" ? o.source : undefined;
  const messages = Array.isArray(o.messages) ? o.messages : null;
  if (!messages) {
    return Response.json({ status: "error", message: "Missing messages array" }, { status: 400 });
  }

  const result = await ingestLinkedInJobAlerts({ source, messages: messages as never });
  return Response.json({
    status: result.status,
    importedCount: result.importedCount,
    skippedCount: result.skippedCount,
    jobs: result.jobs,
    ...(result.status === "error" ? { message: result.error ?? "Ingest failed" } : {}),
  });
}
