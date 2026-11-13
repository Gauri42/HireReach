/* HireReach background worker: sends the AI request (content scripts cannot call other sites directly). */
const DEFAULT_MODEL = { gemini: "gemini-2.5-flash", anthropic: "claude-haiku-5-5" };

async function askGemini({ key, model, prompt }, signal) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 400 } }),
    }
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || `HTTP ${res.status}`);
  const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const text = parts && parts.map((x) => x.text || "").join("").trim();
  if (!text) throw new Error("empty answer");
  return text;
}

async function askAnthropic({ key, model, prompt }, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: {
      "Content-Type": "application/json", "x-api-key": key,
      "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 400, temperature: 0.9, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || `HTTP ${res.status}`);
  const text = j.content && j.content.map((x) => x.text || "").join("").trim();
  if (!text) throw new Error("empty answer");
  return text;
}

async function run(msg) {
  const provider = msg.provider === "anthropic" ? "anthropic" : "gemini";
  const args = { key: String(msg.key || ""), model: String(msg.model || "").trim() || DEFAULT_MODEL[provider], prompt: String(msg.prompt || "") };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    return provider === "gemini" ? await askGemini(args, ctl.signal) : await askAnthropic(args, ctl.signal);
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "timed out" : e.message);
  } finally { clearTimeout(timer); }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== "hr-ai") return;
  run(msg).then((text) => sendResponse({ ok: true, text }), (e) => sendResponse({ ok: false, error: e.message }));
  return true; // keep the channel open for the async answer
});
