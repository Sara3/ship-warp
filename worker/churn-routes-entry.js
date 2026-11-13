  "/api/churn": {
    parse: (body) => {
      const text = String((body && body.text) || "").trim().slice(0, 2000);
      return text ? { input: { text } } : { error: "Send {\"text\": \"...\"}." };
    },
    run: async (env, input) => {
      const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content:
            "You read one customer support message from a subscription customer and judge churn risk. " +
            "Reply with ONLY compact JSON: {\"signal\":\"churn risk\"|\"neutral\"|\"positive\",\"cancellation\":true|false,\"reason\":\"<max 12 words>\"}. " +
            "cancellation=true only if the customer says or implies they may cancel, not renew, switch vendor, or are evaluating alternatives." },
          { role: "user", content: input.text },
        ],
        max_tokens: 80,
        temperature: 0,
      });
      const raw = String((out && (out.response || out.result)) || "");
      const m = raw.match(/\{[\s\S]*\}/);
      const d = m ? JSON.parse(m[0]) : {};
      const signal = ["churn risk", "neutral", "positive"].includes(d.signal) ? d.signal : "neutral";
      return { signal, cancellation: d.cancellation === true, reason: String(d.reason || "").slice(0, 120) };
    },
    failure: "The AI read is unavailable right now. The keyword read still works.",
  },
