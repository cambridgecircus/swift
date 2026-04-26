import { getRunById } from "@/lib/intelligenceStorage";
import { isSupabaseStorageConfigured } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseStorageConfigured()) {
    return Response.json({ status: "error", message: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  const result = await getRunById(id);

  if (result.error === "Not found" || !result.run) {
    return Response.json({ status: "error", message: "Not found" }, { status: 404 });
  }

  return Response.json({
    status: "ok" as const,
    run: result.run,
    marketSignals: result.marketSignals,
    jobOpportunities: result.jobOpportunities,
    sourceHealth: result.sourceHealth,
    ...(result.error ? { partialError: result.error } : {}),
  });
}
