import { generateSwiftIntelligenceReport } from "@/lib/swiftIntelligenceReport";

export async function POST() {
  const res = await generateSwiftIntelligenceReport({ source: "manual", sendEmail: false });
  return Response.json({
    ok: true,
    generatedAt: res.generatedAt,
    report: res.dashboardReport,
    rawReport: res.report,
    storage: res.storage,
    triageUsed: res.triageUsed,
    gmailIntelDiagnostics: res.gmailIntelDiagnostics ?? null,
  });
}
