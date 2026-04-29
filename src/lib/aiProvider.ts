type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiInvokeOptions = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

function getAiProvider(): string {
  return process.env.AI_PROVIDER?.trim().toLowerCase() || "deepseek";
}

function getAiConfig() {
  const provider = getAiProvider();

  if (provider === "deepseek") {
    return {
      provider,
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
      baseUrl: (process.env.AI_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/+$/, ""),
      model: process.env.AI_MODEL?.trim() || "deepseek-chat",
    };
  }

  return {
    provider,
    apiKey: process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
    baseUrl: (process.env.AI_BASE_URL?.trim() || "https://api.openai.com").replace(/\/+$/, ""),
    model: process.env.AI_MODEL?.trim() || "gpt-4o-mini",
  };
}

export function isAiConfigured(): boolean {
  const { apiKey } = getAiConfig();
  return Boolean(apiKey);
}

export async function invokeAiJsonStrict(opts: AiInvokeOptions): Promise<string> {
  const { provider, apiKey, baseUrl, model } = getAiConfig();

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()} API key missing`);
  }

  const url = `${baseUrl}/v1/chat/completions`;
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0,
      max_tokens: typeof opts.maxTokens === "number" ? opts.maxTokens : 1400,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI request failed: HTTP ${res.status}${t ? ` — ${t.slice(0, 240)}` : ""}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };

  if (json.error?.message) throw new Error(json.error.message);

  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("AI returned empty content");

  return content.trim();
}

export function stripMarkdownFences(text: string): string {
  const t = text.trim();
  const open = t.indexOf("```");
  if (open === -1) return t;

  let inner = t.slice(open + 3);
  if (inner.toLowerCase().startsWith("json")) inner = inner.slice(4).trimStart();

  const close = inner.indexOf("```");
  if (close !== -1) return inner.slice(0, close).trim();

  return inner.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

export function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}