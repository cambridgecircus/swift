import { getRssSourceHealth } from "@/lib/rssIngestion";

export async function GET() {
  const sourceHealth = await getRssSourceHealth();
  const checkedAt = new Date().toISOString();

  return Response.json({
    status: "ok",
    checkedAt,
    sourceHealth,
  });
}

