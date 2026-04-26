import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getLatestRuns } from "@/lib/intelligenceStorage";
import { isSupabaseStorageConfigured } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const storageConfigured = isSupabaseStorageConfigured();
  const { runs, error } = await getLatestRuns(10);
  return jsonResponseNoStore({
    status: "ok" as const,
    storageConfigured,
    runs,
    ...(error ? { error } : {}),
  });
}
