export async function sendReportEmail(report: unknown): Promise<never> {
  void report;
  throw new Error(
    "Legacy multi-card report email is disabled. Use generateGeoAiDailyBrief({ sendEmail: true }) for GEO-only email delivery.",
  );
}
