import { sourceRegistry } from "@/lib/sourceRegistry";

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>((acc, v) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

export async function GET() {
  const totalSources = sourceRegistry.length;
  const enabledSources = sourceRegistry.filter((s) => s.enabled).length;

  const byTopic = countBy(sourceRegistry.map((s) => s.topic));
  const byType = countBy(sourceRegistry.map((s) => s.sourceType));

  return Response.json({
    status: "ok",
    totalSources,
    enabledSources,
    byTopic,
    byType,
    sources: sourceRegistry,
  });
}

