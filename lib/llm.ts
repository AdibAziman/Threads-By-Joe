import { z } from "zod";
import { db, nowIso } from "./db";
import { env } from "./env";

export class LlmError extends Error {}

/** Conservative flash estimate (cache miss, peak) in USD per 1M tokens. Used for per-customer cost tracking only. */
const PRICE_IN = 0.3;
const PRICE_OUT = 1.2;

export interface LlmContext {
  userId: string;
  accountId?: string;
  purpose: "generate" | "classify" | "reply";
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function record(ctx: LlmContext, model: string, tin: number, tout: number, ok: boolean) {
  db()
    .prepare("INSERT INTO llm_calls (user_id, account_id, purpose, model, tokens_in, tokens_out, cost_usd, ok, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(ctx.userId, ctx.accountId ?? null, ctx.purpose, model, tin, tout, (tin * PRICE_IN + tout * PRICE_OUT) / 1e6, ok ? 1 : 0, nowIso());
}

/** Ask the model for JSON and validate it. Retries once on invalid output. Provider-agnostic: any OpenAI-compatible endpoint works. */
export async function chatJson<T>(
  ctx: LlmContext,
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T> {
  if (env.llmMock) {
    const mocked = mockResponse(ctx.purpose, user);
    record(ctx, "mock", 0, 0, true);
    return schema.parse(mocked);
  }
  if (!env.deepseekKey) throw new LlmError("DeepSeek API key is not configured (set DEEPSEEK_API_KEY).");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let tin = 0;
    let tout = 0;
    try {
      const res = await fetch(`${env.deepseekBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.deepseekKey}` },
        body: JSON.stringify({
          model: env.deepseekModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: opts.temperature ?? 0.8,
          max_tokens: opts.maxTokens ?? 1200,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new LlmError(`DeepSeek ${res.status}: ${body}`);
      }
      const data = (await res.json()) as ChatResponse;
      tin = data.usage?.prompt_tokens ?? 0;
      tout = data.usage?.completion_tokens ?? 0;
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = schema.parse(JSON.parse(content));
      record(ctx, env.deepseekModel, tin, tout, true);
      return parsed;
    } catch (e) {
      lastErr = e;
      record(ctx, env.deepseekModel, tin, tout, false);
      if (e instanceof LlmError && /DeepSeek (401|402|403)/.test(e.message)) break; // auth/billing: retrying will not help
    }
  }
  throw lastErr instanceof Error ? lastErr : new LlmError("LLM call failed");
}

/** Canned responses so the whole app can be exercised without an API key. Clearly marked; the safety gate rejects "[mock]". */
function mockResponse(purpose: LlmContext["purpose"], user: string): unknown {
  const seed = Math.abs([...user].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
  if (purpose === "classify") {
    const c = (/<comment>([\s\S]*?)<\/comment>/.exec(user)?.[1] ?? "").toLowerCase();
    if (/ignore (all )?previous|buy-|http|www\./.test(c)) return { class: "spam", risk: 0.9, reason: "link drop or instruction attempt" };
    if (/refund|charged|scam|broken|angry|worst/.test(c)) return { class: "complaint", risk: 0.8, reason: "customer complaint" };
    if (c.includes("?")) return { class: "question", risk: 0.2, reason: "asks a question" };
    return { class: "praise", risk: 0.05, reason: "positive remark" };
  }
  if (purpose === "reply") {
    const options = ["Glad it landed. What part of it feels hardest for you right now?", "Short answer: pick a cadence you can keep on your worst week, then add from there.", "Appreciate you sharing that. Curious what you are building?"];
    return { text: options[seed % options.length] };
  }
  const kind = /Kind: (\w+)/.exec(user)?.[1] ?? "random";
  const bank: Record<string, string[]> = {
    hook: ["Nobody tells you this about consistency: the boring posts build the audience, the viral ones just borrow it.", "You do not have a content problem. You have a decision problem. Pick one topic for 30 days.", "The first line decides everything. Write ten, keep the one that makes you slightly uncomfortable."],
    tip: ["Batch your drafts on one day, schedule them across the week, and spend your daily time on replies instead.", "Reuse one idea three ways: a question, a story, a plain tip. Same idea, three different readers.", "End posts with a question only when you actually want the answer."],
    promo: ["I help solo creators plan a month of posts in one sitting. If that sounds useful, the link is in my profile.", "New this week: a simple checklist for turning one idea into five posts. Ask and I will send it.", "Small offer for the next few people who reply: a free review of your last five posts."],
    marketing: ["Offer, proof, next step. Every marketing post can be that short.", "People buy from the account they already trust. Show your process, not just the result.", "Your best marketing is a specific answer to a question people already ask you."],
    random: ["Unpopular opinion: a calm feed beats a clever one.", "Today I rewrote a post six times and posted the first version. Lesson learned, again.", "What is one tool you stopped using this year, and why?"],
  };
  const list = bank[kind] ?? bank.random;
  return { variants: [0, 1, 2].map((i) => ({ text: list[(seed + i) % list.length], angle: ["direct", "story", "question"][i] })) };
}
