import { jsonResponseNoStore } from "@/lib/httpNoStore";
import { getWeeklySummary } from "@/lib/intelligenceStorage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 7;
  const safeDays = Number.isFinite(days) ? days : 7;

  const summary = await getWeeklySummary(safeDays);
  return jsonResponseNoStore(summary);
}
