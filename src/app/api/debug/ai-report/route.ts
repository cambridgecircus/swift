import {
  generateDeepSeekReportResult,
  isDeepSeekConfigured,
  shouldUseDeepSeek,
} from "@/lib/deepseekClient";
import { getCleanedMarketSignals } from "@/lib/rssIngestion";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const invoke = url.searchParams.get("invoke") === "1";

  const base = {
    status: "ok" as const,
    checkedAt: new Date().toISOString(),
    deepseekApiKeyConfigured: isDeepSeekConfigured(),
    aiProvider: process.env.AI_PROVIDER?.trim() ?? null,
    useDeepSeek: shouldUseDeepSeek(),
  };

  if (!invoke) {
    return Response.json({
      ...base,
      hint: "Add ?invoke=1 to run ingestion + DeepSeek (uses your API quota).",
    });
  }

  if (!shouldUseDeepSeek()) {
    return Response.json({
      ...base,
      invokeSkipped: true,
      reason: "Set DEEPSEEK_API_KEY and AI_PROVIDER=deepseek to invoke the model.",
    });
  }

  const cleanedSignals = await getCleanedMarketSignals();
  if (cleanedSignals.length === 0) {
    return Response.json({
      ...base,
      invokeResult: "no_signals",
      cleanedSignalCount: 0,
    });
  }

  const generatedAt = new Date().toISOString();
  const result = await generateDeepSeekReportResult({
    cleanedSignals,
    generatedAt,
  });

  const d = result.diagnostics;

  if (result.ok) {
    return Response.json({
      ...base,
      invokeResult: "success",
      cleanedSignalCount: cleanedSignals.length,
      contractReceived: true,
      marketBriefCount: result.contract.marketBriefs.length,
      executiveSummaryChars: result.contract.executiveSummary.length,
      apiStatus: d.apiStatus,
      modelsAttempted: d.modelsAttempted,
    });
  }

  return Response.json({
    ...base,
    invokeResult: "failed_validation_or_api",
    cleanedSignalCount: cleanedSignals.length,
    contractReceived: false,
    marketBriefCount: 0,
    executiveSummaryChars: 0,
    apiStatus: d.apiStatus,
    apiErrorMessage: d.apiErrorMessage,
    rawResponsePreview: d.rawResponsePreview,
    parseError: d.parseError,
    validationMissingFields: d.validationMissingFields,
    modelsAttempted: d.modelsAttempted,
  });
}
