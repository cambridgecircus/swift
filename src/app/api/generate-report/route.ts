import { generateReport } from "@/lib/generateReport";

export async function POST() {
  const report = await generateReport();
  return Response.json(report);
}
