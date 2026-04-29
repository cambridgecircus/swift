import { Resend } from "resend";
import type { IntelligenceReport } from "@/lib/generateReport";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkRow(label: string, url: string | undefined): string {
  if (!url || !/^https?:\/\//i.test(url)) {
    return `<span style="color:#64748b;">${esc(label)} — source not available</span>`;
  }
  return `<a href="${esc(url)}" style="color:#25F4EE;font-weight:600;">${esc(label)}</a>`;
}

function buildReportHtml(report: IntelligenceReport) {
  const briefBlock = (title: string, lines: NonNullable<IntelligenceReport["web3AiBriefLines"]>) => {
    if (!lines?.length) return "";
    const items = lines
      .slice(0, 4)
      .map(
        (s) => `
        <li style="margin-bottom:18px;">
          <strong style="color:#f8fafc;">${esc(s.title)}</strong>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;">
            <span style="color:#94a3b8;">What happened:</span> ${esc(s.whatHappened)}
          </p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;">
            <span style="color:#94a3b8;">Why it matters:</span> ${esc(s.whyItMatters)}
          </p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;">
            <span style="color:#94a3b8;">HRBP implication:</span> ${esc(s.hrbpImplication)}
          </p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;">
            <span style="color:#94a3b8;">Suggested action:</span> ${esc(s.suggestedAction)}
          </p>
          <p style="margin:8px 0 0;font-size:13px;">${linkRow("Source", s.sourceUrl)} · ${esc(s.sourceName)}</p>
        </li>`,
      )
      .join("");
    return `
      <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;border-left:3px solid #FE2C55;padding-left:12px;">${esc(title)}</h2>
      <ul style="font-size:15px;line-height:1.55;padding-left:18px;color:#e2e8f0;">${items}</ul>`;
  };

  const emp = report.employmentLaw;
  const empItems = emp?.items?.length
    ? emp.items.slice(0, 4)
    : [];
  const empDisclaimerLine = emp
    ? /\bnot legal advice\b/i.test(emp.disclaimer)
      ? esc(emp.disclaimer)
      : `${esc(emp.disclaimer)} Not legal advice.`
    : "";
  const empHtml = emp
    ? `
    <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;border-left:3px solid #7C5CFF;padding-left:12px;">Employment Law</h2>
    <p style="font-size:13px;color:#f472b6;margin:8px 0 12px;">${empDisclaimerLine}</p>
    <p style="font-size:15px;line-height:1.65;color:#cbd5e1;">${esc(emp.headline)}</p>
    ${
      empItems.length === 0
        ? `<p style="margin-top:12px;font-size:14px;color:#94a3b8;">No strong employment law update found in this send window (taxonomy excludes pure crypto/securities items without workforce context).</p>`
        : `<ul style="font-size:14px;line-height:1.6;padding-left:18px;color:#e2e8f0;">
      ${empItems
        .map(
          (it) => `
        <li style="margin-bottom:16px;">
          <strong>${esc(it.title)}</strong>
          ${it.jurisdiction ? `<br/><span style="color:#94a3b8;">Jurisdiction:</span> ${esc(it.jurisdiction)}` : ""}
          ${it.lawTheme ? `<br/><span style="color:#94a3b8;">Theme:</span> ${esc(it.lawTheme)}` : ""}
          ${it.confidence ? `<br/><span style="color:#94a3b8;">Confidence:</span> ${esc(it.confidence)}` : ""}
          ${it.whyItQualifies ? `<br/><span style="color:#94a3b8;">Why it qualifies:</span> ${esc(it.whyItQualifies)}` : ""}
          <br/><span style="color:#cbd5e1;">${esc(it.whatChanged)}</span><br/>
          <span style="color:#94a3b8;">Why it matters:</span> ${esc(it.whyItMatters)}<br/>
          <span style="color:#94a3b8;">HRBP implication:</span> ${esc(it.hrbpImplication)}<br/>
          <span style="color:#94a3b8;">Suggested action:</span> ${esc(it.suggestedAction)}<br/>
          ${linkRow("Source", it.sourceUrl)} · ${esc(it.sourceName)}
        </li>`,
        )
        .join("")}
    </ul>`
    }
    `
    : "";

  const ex = report.expansionDownsizing;
  const restructCount = typeof ex?.restructuringCount === "number" ? ex.restructuringCount : 0;
  const topEx = Array.isArray(ex?.topExpansionSignals) ? ex.topExpansionSignals.slice(0, 2) : [];
  const topDn = Array.isArray(ex?.topDownsizingRestructureSignals)
    ? ex.topDownsizingRestructureSignals.slice(0, 2)
    : [];
  const exHtml = ex
    ? `
    <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;border-left:3px solid #25F4EE;padding-left:12px;">Expansion &amp; Downsizing Trends</h2>
    ${
      ex.expansionCount === 0 && ex.downsizingCount === 0 && restructCount === 0
        ? `<p style="margin-top:10px;font-size:14px;color:#94a3b8;">No qualified workforce expansion, downsizing, or restructuring signal was found in the current run.</p>`
        : ""
    }
    <p style="font-size:14px;line-height:1.65;color:#cbd5e1;">Qualified counts: <strong>${ex.expansionCount}</strong> expansion · <strong>${ex.downsizingCount}</strong> downsizing / headcount · <strong>${restructCount}</strong> restructuring / transformation.</p>
    <p style="margin-top:10px;font-size:14px;color:#cbd5e1;"><strong>Expansion (${ex.expansionCount}):</strong> ${esc(ex.expansionSummary)}</p>
    <p style="margin-top:8px;font-size:14px;color:#cbd5e1;"><strong>Downsizing (${ex.downsizingCount}):</strong> ${esc(ex.downsizingSummary)}</p>
    ${
      typeof ex.restructuringSummary === "string" && ex.restructuringSummary.trim()
        ? `<p style="margin-top:8px;font-size:14px;color:#cbd5e1;"><strong>Restructuring (${restructCount}):</strong> ${esc(ex.restructuringSummary)}</p>`
        : ""
    }
    ${
      topEx.length
        ? `<p style="margin-top:10px;font-size:13px;color:#94a3b8;font-weight:600;">Top expansion signals</p>
    <ol style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#e2e8f0;padding-left:20px;">
      ${topEx
        .map(
          (row) => `
        <li style="margin-bottom:10px;">
          <strong>${esc(row.title)}</strong>
          ${row.sourceName ? `<span style="color:#94a3b8;"> · ${esc(row.sourceName)}</span>` : ""}<br/>
          ${row.sourceUrl && /^https?:\/\//i.test(row.sourceUrl) ? `<a href="${esc(row.sourceUrl)}" style="color:#25F4EE;">Source</a>` : `<span style="color:#64748b;">Source not available</span>`}
        </li>`,
        )
        .join("")}
    </ol>`
        : ""
    }
    ${
      topDn.length
        ? `<p style="margin-top:12px;font-size:13px;color:#94a3b8;font-weight:600;">Top downsizing / restructuring signals</p>
    <ol style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#e2e8f0;padding-left:20px;">
      ${topDn
        .map(
          (row) => `
        <li style="margin-bottom:10px;">
          <strong>${esc(row.title)}</strong>
          ${row.sourceName ? `<span style="color:#94a3b8;"> · ${esc(row.sourceName)}</span>` : ""}<br/>
          ${row.sourceUrl && /^https?:\/\//i.test(row.sourceUrl) ? `<a href="${esc(row.sourceUrl)}" style="color:#25F4EE;">Source</a>` : `<span style="color:#64748b;">Source not available</span>`}
        </li>`,
        )
        .join("")}
    </ol>`
        : ""
    }
    <p style="margin-top:8px;font-size:14px;color:#cbd5e1;"><strong>Strongest expansion:</strong> ${esc(ex.strongestExpansionSignal ?? ex.strongestSignal)}</p>
    <p style="margin-top:6px;font-size:14px;color:#cbd5e1;"><strong>Strongest downsizing / headcount:</strong> ${esc(ex.strongestDownsizingSignal ?? "—")}</p>
    <p style="margin-top:8px;font-size:14px;color:#cbd5e1;"><strong>Workforce planning implication:</strong> ${esc(ex.peopleImplication)}</p>
    <p style="margin-top:8px;font-size:14px;color:#cbd5e1;"><strong>Suggested HRBP action:</strong> ${esc(ex.suggestedHrbpAction)}</p>
    ${
      ex.sourceUrls?.length
        ? `<p style="margin-top:10px;font-size:13px;color:#94a3b8;">Sources: ${ex.sourceUrls
            .slice(0, 8)
            .map((u) => `<a href="${esc(u)}" style="color:#25F4EE;">link</a>`)
            .join(" · ")}</p>`
        : `<p style="margin-top:10px;font-size:13px;color:#64748b;">Sources: source not available</p>`
    }`
    : "";

  const jobsHtml =
    report.liveJobOpportunities && report.liveJobOpportunities.length > 0
      ? `
    <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;">Live Job Opportunities</h2>
    <ol style="font-size:14px;line-height:1.6;padding-left:18px;color:#e2e8f0;">
      ${report.liveJobOpportunities
        .map((j) => {
          const href = j.applyUrl?.trim() || j.sourceUrl?.trim();
          const isLi = j.source === "LinkedIn Job Alert" || (j.applyUrl?.includes("linkedin.com") ?? false);
          const label = isLi || !j.applyUrl ? "View source" : "Apply";
          return `
        <li style="margin-bottom:16px;">
          <strong>${esc(j.role)}</strong> — ${esc(j.company)} · ${esc(j.location)}<br/>
          <span style="color:#94a3b8;">Fit:</span> ${esc(String(j.fitScore))}/100 · <span style="color:#94a3b8;">Source:</span> ${esc(j.source)}<br/>
          <span style="color:#cbd5e1;">${esc(j.whyThisFits)}</span><br/>
          ${href && /^https?:\/\//i.test(href) ? `<a href="${esc(href)}" style="color:#FE2C55;font-weight:600;">${esc(label)}</a>` : "source not available"}
        </li>`;
        })
        .join("")}
    </ol>`
      : `<h2 style="font-size:18px;margin-top:28px;color:#f8fafc;">Live Job Opportunities</h2><p style="color:#64748b;">No live jobs in this send window.</p>`;

  const skillsHtml =
    report.skillsToPickUp && report.skillsToPickUp.length > 0
      ? `
    <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;">Skills to Pick Up</h2>
    <ul style="font-size:14px;line-height:1.6;padding-left:18px;color:#e2e8f0;">
      ${report.skillsToPickUp
        .map(
          (s) => `
        <li style="margin-bottom:12px;">
          <strong>${esc(s.skill)}</strong> — priority ${esc(s.priorityScore)}<br/>
          <span style="color:#cbd5e1;">Why now:</span> ${esc(s.whyNow)}<br/>
          <span style="color:#cbd5e1;">Next action:</span> ${esc(s.nextAction)}
        </li>`,
        )
        .join("")}
    </ul>`
      : "";

  const learnHtml =
    report.learningAssets && report.learningAssets.length > 0
      ? `
    <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;">Learning Assets</h2>
    <ul style="font-size:14px;line-height:1.6;padding-left:18px;color:#e2e8f0;">
      ${report.learningAssets
        .map(
          (a) => `
        <li style="margin-bottom:12px;">
          <strong>${esc(a.topic)}</strong> (${esc(a.format)})<br/>
          ${a.linkedSkill ? `<span style="color:#94a3b8;">Linked skill:</span> ${esc(a.linkedSkill)}<br/>` : ""}
          <span style="color:#cbd5e1;">Why now:</span> ${esc(a.whyNow)}<br/>
          <span style="color:#cbd5e1;">Intended output:</span> ${esc(a.intendedOutput)}
        </li>`,
        )
        .join("")}
    </ul>`
      : "";

  const patternHtml = report.thisWeekPattern
    ? `<h2 style="font-size:18px;margin-top:28px;color:#f8fafc;">This Week&apos;s Pattern</h2><p style="font-size:14px;line-height:1.65;color:#cbd5e1;">${esc(report.thisWeekPattern)}</p>`
    : "";

  const recHtml = report.hrbpRecommendations
    .map((item) => `<li style="margin-bottom:8px;">${esc(item)}</li>`)
    .join("");

  const legacySignals =
    report.keySignals.length > 0
      ? `<h2 style="font-size:16px;margin-top:24px;color:#94a3b8;">Signal index</h2>
         <ul style="font-size:13px;line-height:1.5;padding-left:18px;color:#94a3b8;">
           ${report.keySignals
             .map(
               (s) =>
                 `<li><strong>${esc(s.title)}</strong> — ${esc(s.implication)} ${
                   s.sourceUrl ? `<a href="${esc(s.sourceUrl)}" style="color:#25F4EE;">source</a>` : ""
                 }</li>`,
             )
             .join("")}
         </ul>`
      : "";

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:720px;margin:0 auto;color:#0f172a;background:#050507;padding:28px;border-radius:16px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#25F4EE;font-weight:700;">SWIFT DAILY INTELLIGENCE</p>

      <h1 style="font-size:26px;line-height:1.25;margin:16px 0;color:#f8fafc;">
        ${esc(report.headline)}
      </h1>

      <p style="font-size:13px;color:#64748b;">
        Generated at ${new Date(report.generatedAt).toLocaleString()}
      </p>

      <h2 style="font-size:18px;margin-top:26px;color:#f8fafc;">Executive summary</h2>
      <p style="font-size:15px;line-height:1.75;color:#cbd5e1;">
        ${esc(report.executiveSummary)}
      </p>

      ${briefBlock("Web3 x AI Daily Brief", report.web3AiBriefLines ?? [])}
      ${briefBlock("HRBP Daily Brief", report.hrbpBriefLines ?? [])}

      ${empHtml}
      ${exHtml}

      ${jobsHtml}
      ${skillsHtml}
      ${learnHtml}
      ${patternHtml}

      <h2 style="font-size:18px;margin-top:28px;color:#f8fafc;">HRBP recommendations</h2>
      <ul style="font-size:15px;line-height:1.6;padding-left:20px;color:#e2e8f0;">
        ${recHtml}
      </ul>

      ${legacySignals}

      <hr style="border:none;border-top:1px solid rgba(148,163,184,0.25);margin:32px 0;" />

      <p style="font-size:12px;color:#64748b;">
        Sent by SWIFT — Web3 × AI HRBP intelligence. Employment Law section: not legal advice.
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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from,
    to: recipient,
    subject: `SWIFT Daily Intelligence — ${new Date().toLocaleDateString()}`,
    html: buildReportHtml(report),
  });

  return result;
}
