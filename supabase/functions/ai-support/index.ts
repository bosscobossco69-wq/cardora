// Supabase Edge Function: ai-support
// Deploy: Supabase Dashboard -> Edge Functions -> ai-support -> Code -> Deploy updates.
// Secrets (any one is enough, tried in order):
//   AI_GATEWAY_API_KEY (Vercel AI Gateway, free tier)
//   OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY
// Last resort: Pollinations anonymous endpoint (no key, 1 reply / 30 s per IP).

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VERCEL_KEY = Deno.env.get("AI_GATEWAY_API_KEY") || "";
const VERCEL_MODELS = [
  Deno.env.get("AI_GATEWAY_MODEL") || "nvidia/nemotron-3.5-lightning-free",
  "reflection/beam-free",
  "poolside/laguna-s-2.1-free",
];

const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const OPENROUTER_MODELS = [
  Deno.env.get("OPENROUTER_MODEL") || "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/free",
];

const GROQ_KEY = Deno.env.get("GROQ_API_KEY") || "";
const GROQ_MODELS = [
  Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];

const SYSTEM_PROMPT = `You are Trixovel Support, the assistant on the Trixovel collectible card marketplace preview.

Facts you must follow:
- This website is a preview. Real payments, checkout, refunds, payouts and order fulfilment are NOT live.
- Prices display in USD as the base currency. Local currency estimates (e.g. MYR) are reference only. FPX/bank payment is not connected.
- Users can sign in with Google or email on the site. Never ask for passwords, one-time codes, recovery phrases, bank credentials, card numbers or identity documents.
- Sellers are responsible for condition, language, authenticity and shipping. Platform fees shown are examples only.
- You cannot read accounts, orders, balances or payments, and you cannot confirm that anything was paid.
- Never tell a user to send money to a personal bank account, QR code, wallet or any account shared in chat. Treat such requests as scams and warn the user.
- Do not discuss topics unrelated to Trixovel. Politely redirect.
- Answer in the user's language (English, 中文 or Bahasa Melayu). Be concise: at most 120 words. If you are unsure, say so and suggest contacting official support once published.`;

type Turn = { role?: string; text?: string };
type Msg = { role: string; content: string };
type Result = { status: number; reason: string; reply: string };
type Provider = {
  name: string;
  url: string;
  key: string;
  models: string[];
  headers?: Record<string, string>;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

const hits = new Map<string, { n: number; t: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.t > 60_000) {
    if (hits.size > 2_000) hits.clear();
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  rec.n += 1;
  return rec.n > 20;
}

async function askOpenAICompatible(
  provider: Provider,
  model: string,
  messages: Msg[],
): Promise<Result> {
  const headers: Record<string, string> = { "content-type": "application/json", ...provider.headers };
  if (provider.key) headers.authorization = `Bearer ${provider.key}`;

  let res: Response;
  try {
    res = await fetch(provider.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 400 }),
      signal: AbortSignal.timeout(9_000),
    });
  } catch {
    return { status: 0, reason: "network/timeout", reply: "" };
  }

  const raw = await res.text();
  if (!res.ok) {
    console.error(provider.name, model, res.status, raw.slice(0, 300));
    let reason = raw.slice(0, 200);
    try {
      reason = JSON.parse(raw)?.error?.message?.slice(0, 200) || reason;
    } catch { /* keep raw */ }
    return { status: res.status, reason, reply: "" };
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 502, reason: "bad JSON from provider", reply: "" };
  }
  const reply = String(data?.choices?.[0]?.message?.content || "").trim();
  return { status: 200, reason: "", reply };
}

async function askGemini(model: string, contents: unknown[]): Promise<Result> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_KEY}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(9_000),
    });
  } catch {
    return { status: 0, reason: "network/timeout", reply: "" };
  }

  const raw = await res.text();
  if (!res.ok) {
    console.error("gemini", model, res.status, raw.slice(0, 300));
    let reason = raw.slice(0, 200);
    try {
      reason = JSON.parse(raw)?.error?.message?.slice(0, 200) || reason;
    } catch { /* keep raw */ }
    return { status: res.status, reason, reply: "" };
  }

  let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 502, reason: "bad JSON from provider", reply: "" };
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const reply = Array.isArray(parts)
    ? parts.map((p) => String(p?.text || "")).join("").trim()
    : "";
  return { status: 200, reason: "", reply };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) return json({ error: "Too many requests, please wait a minute" }, 429);

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > 8_000) return json({ error: "Message too large" }, 413);

  let body: { message?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const message = String(body?.message ?? "").trim().slice(0, 500);
  if (!message) return json({ error: "Message is required" }, 400);

  const history: Turn[] = Array.isArray(body?.history)
    ? (body.history as Turn[])
        .filter((h) => h && typeof h.text === "string" && h.text.trim())
        .slice(-6)
    : [];

  const messages: Msg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.text).slice(0, 500),
    })),
    { role: "user", content: message },
  ];

  const contents = [
    ...history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: String(h.text).slice(0, 500) }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const providers: Provider[] = [
    {
      name: "vercel",
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      key: VERCEL_KEY,
      models: VERCEL_MODELS,
    },
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: OPENROUTER_KEY,
      models: OPENROUTER_MODELS,
      headers: {
        "HTTP-Referer": "https://cardora-git-staging-order-safety-fixes-pokemon-treasure.vercel.app",
        "X-Title": "Trixovel Support",
      },
    },
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: GROQ_KEY,
      models: GROQ_MODELS,
    },
  ].filter((p) => p.key);

  let lastStatus = 0;
  let lastReason = "";
  const attempts: { provider: string; model: string; status: number; reason: string }[] = [];

  const retryable = (r: Result) =>
    r.status === 0 || r.status === 429 || r.status >= 500;

  for (const provider of providers) {
    for (const model of provider.models) {
      const r = await askOpenAICompatible(provider, model, messages);
      if (r.reply) {
        return json({ reply: r.reply.slice(0, 1200), provider: provider.name, model });
      }
      lastStatus = r.status;
      lastReason = r.reason;
      attempts.push({ provider: provider.name, model, status: r.status, reason: r.reason.slice(0, 150) });
      if (!retryable(r)) break;
    }
  }

  if (GEMINI_KEY) {
    for (const model of GEMINI_MODELS) {
      const r = await askGemini(model, contents);
      if (r.reply) return json({ reply: r.reply.slice(0, 1200), provider: "gemini", model });
      lastStatus = r.status;
      lastReason = r.reason;
      attempts.push({ provider: "gemini", model, status: r.status, reason: r.reason.slice(0, 150) });
      if (!retryable(r)) break;
    }
  }

  const lastResort: Provider = {
    name: "pollinations",
    url: "https://text.pollinations.ai/openai",
    key: "",
    models: ["openai"],
  };
  const r = await askOpenAICompatible(lastResort, "openai", messages);
  if (r.reply) return json({ reply: r.reply.slice(0, 1200), provider: "pollinations", model: "openai" });
  lastStatus = r.status;
  lastReason = r.reason;
  attempts.push({ provider: "pollinations", model: "openai", status: r.status, reason: r.reason.slice(0, 150) });

  return json({ error: "AI provider error", providerStatus: lastStatus, reason: lastReason, attempts }, 502);
});
