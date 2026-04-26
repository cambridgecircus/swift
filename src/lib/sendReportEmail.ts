import { Resend } from "resend";
import type { IntelligenceReport } from "@/lib/generateReport";

const resend = new Resend(process.env.RESEND_API_KEY);

function buildReportHtml(report: IntelligenceReport) {
  const keySignalsHtml = report.keySignals
    .map(
      (signal) => `
        <li style="margin-bottom: 16px;">
          <strong>${signal.title}</strong><br />
          <span>${signal.implication}</span>
        </li>
      `
    )
    .join("");

  const recommendationsHtml = report.hrbpRecommendations
    .map((item) => `<li style="margin-bottom: 8px;">${item}</li>`)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #0f172a;">
      <p style="font-size: 12px; letter-spacing: 0.2em; color: #0891b2; font-weight: 700;">
        SWIFT DAILY INTELLIGENCE
      </p>

      <h1 style="font-size: 28px; line-height: 1.25; margin: 16px 0;">
        ${report.headline}
      </h1>

      <p style="font-size: 14px; color: #64748b;">
        Generated at ${new Date(report.generatedAt).toLocaleString()}
      </p>

      <h2 style="font-size: 18px; margin-top: 28px;">Executive summary</h2>
      <p style="font-size: 15px; line-height: 1.7;">
        ${report.executiveSummary}
      </p>

      <h2 style="font-size: 18px; margin-top: 28px;">Key market signals</h2>
      <ul style="font-size: 15px; line-height: 1.6; padding-left: 20px;">
        ${keySignalsHtml}
      </ul>

      <h2 style="font-size: 18px; margin-top: 28px;">HRBP recommendations</h2>
      <ul style="font-size: 15px; line-height: 1.6; padding-left: 20px;">
        ${recommendationsHtml}
      </ul>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />

      <p style="font-size: 12px; color: #64748b;">
        Sent by SWIFT — Web3 x AI HRBP Intelligence Dashboard.
      </p>
    </div>
  `;
}

export async function sendReportEmail(report: IntelligenceReport) {
  const recipient = process.env.REPORT_RECIPIENT_EMAIL;
  const from = process.env.REPORT_FROM_EMAIL;

  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  if (!recipient || !from) {
    throw new Error("Missing REPORT_RECIPIENT_EMAIL or REPORT_FROM_EMAIL");
  }

  const result = await resend.emails.send({
    from,
    to: recipient,
    subject: `SWIFT Daily Intelligence — ${new Date().toLocaleDateString()}`,
    html: buildReportHtml(report),
  });

  return result;
}
