/**
 * Bizz Padi's AI, with a switch (26 Nov 2026).
 *
 * Femi wanted to be free to use whichever model is cheapest or best at the time, so Padi never
 * talks to one company directly. Two kinds of connection cover almost every provider:
 *
 *   PADI_AI_PROVIDER=anthropic   Claude (Messages API). Key: ANTHROPIC_API_KEY.
 *   PADI_AI_PROVIDER=openai      Anything that speaks the OpenAI "chat completions" format:
 *                                OpenAI itself, Google Gemini, DeepSeek, Qwen, Z.AI (free GLM
 *                                models), Groq, OpenRouter… Key: PADI_AI_KEY.
 *                                Address: PADI_AI_BASE_URL (defaults to OpenAI). Examples:
 *                                  Gemini   https://generativelanguage.googleapis.com/v1beta/openai
 *                                  DeepSeek https://api.deepseek.com
 *                                  Z.AI     https://api.z.ai/api/paas/v4
 *
 *   PADI_AI_MODEL   the model name for that provider (e.g. claude-haiku-5-5, gpt-5-nano,
 *                   gemini-3.1-flash-lite, glm-4.7-flash). Has a sensible default per provider.
 *
 * Switching = change these environment variables on Vercel and redeploy. No code changes.
 * If nothing is set, padiAiReady() is false and the pages say the assistant isn't switched on yet.
 *
 * Server only: keys must never reach the browser.
 */
export type ChatTurn = { role: "user" | "assistant"; content: string };

const provider = () => (process.env.PADI_AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai")).toLowerCase();

function settings() {
  if (provider() === "anthropic") {
    return {
      kind: "anthropic" as const,
      key: process.env.ANTHROPIC_API_KEY || "",
      base: (process.env.ANTHROPIC_BASE || "https://api.anthropic.com").replace(/\/$/, ""),
      model: process.env.PADI_AI_MODEL || "claude-haiku-5-5",
    };
  }
  return {
    kind: "openai" as const,
    key: process.env.PADI_AI_KEY || process.env.OPENAI_API_KEY || "",
    base: (process.env.PADI_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.PADI_AI_MODEL || "gpt-5-nano",
  };
}

/** True when a provider and key are configured. */
export function padiAiReady() {
  return Boolean(settings().key);
}

/** Which model is answering (shown nowhere to customers; useful in logs and the owner console). */
export function padiAiLabel() {
  const s = settings();
  return `${s.kind}:${s.model}`;
}

/**
 * Ask the model for a JSON object. The system prompt describes the shape; we parse the first
 * {...} block in the reply, so it works even with models that add a sentence around the JSON.
 * Throws a friendly Error on failure (the caller shows it).
 */
export async function askJson<T>(system: string, turns: ChatTurn[], maxTokens = 1800): Promise<T> {
  const s = settings();
  if (!s.key) throw new Error("The assistant isn't switched on yet.");

  let text = "";
  if (s.kind === "anthropic") {
    const res = await fetch(`${s.base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": s.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: s.model, max_tokens: maxTokens, system, messages: turns }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`The assistant is busy right now (${res.status}). Try again in a minute.`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  } else {
    const res = await fetch(`${s.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.key}` },
      body: JSON.stringify({
        model: s.model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...turns],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`The assistant is busy right now (${res.status}). Try again in a minute.`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    text = data.choices?.[0]?.message?.content ?? "";
  }

  // Pull out the JSON object (some models wrap it in ```json fences or a sentence).
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The assistant's answer came back empty. Try again.");
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    throw new Error("The assistant's answer was garbled. Try again.");
  }
}
