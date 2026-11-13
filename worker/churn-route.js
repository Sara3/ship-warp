// ChurnRadar AI route for the existing "bidbench" Cloudflare Worker (Workers AI binding named `AI`).
// Add this handler to the worker's fetch() router: if (url.pathname === "/api/churn") return handleChurn(request, env);
// No API key in the page: the model runs server-side on Workers AI.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function handleChurn(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let text = "";
  try { text = String((await request.json()).text || "").slice(0, 2000).trim(); } catch (_) {}
  if (!text) return json({ ok: false, error: "no text" }, 400);

  const prompt = [
    { role: "system", content:
      "You read one customer support message from a B2B or subscription customer and judge churn risk. " +
      "Reply with ONLY compact JSON: {\"signal\":\"churn risk\"|\"neutral\"|\"positive\",\"cancellation\":true|false,\"reason\":\"<max 12 words>\"}. " +
      "cancellation=true only if the customer says or implies they may cancel, not renew, switch vendor, or are evaluating alternatives." },
    { role: "user", content: text },
  ];

  try {
    const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: prompt, max_tokens: 80, temperature: 0 });
    const raw = String(out && (out.response || out.result || "")).trim();
    const m = raw.match(/\{[\s\S]*\}/);
    const d = m ? JSON.parse(m[0]) : {};
    const signal = ["churn risk", "neutral", "positive"].includes(d.signal) ? d.signal : "neutral";
    return json({ ok: true, data: { signal, cancellation: d.cancellation === true, reason: String(d.reason || "").slice(0, 120) } });
  } catch (e) {
    return json({ ok: false, error: "model error" }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}
