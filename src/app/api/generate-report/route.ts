import { generateGeoAiDailyBrief, getLatestGeoAiDailyBrief } from "@/lib/geoAiDailyBrief";

export async function GET() {
  const result = await getLatestGeoAiDailyBrief();
  return Response.json({
    ok: true,
    report: result.brief,
    empty: !result.brief,
    storageConfigured: result.storageConfigured,
    error: result.error,
  });
}

export async function POST() {
  const result = await generateGeoAiDailyBrief();
  return Response.json({
    ok: true,
    generatedAt: result.brief?.generatedAt ?? null,
    report: result.brief,
    empty: result.empty === true,
    storage: result.storage,
  });
}
