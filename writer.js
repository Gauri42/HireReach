/* HireReach message writer.
 * Smart mode: rule-based, free, private (runs in the page).
 * AI mode:    asks an AI service you choose (needs your own API key) via background.js.
 * Exposed as self.HR_WRITER for content.js. */
(() => {
  "use strict";
  if (self.HR_WRITER) return;
  const W = {};

  // ---------- reading a headline ----------
  W.parse = (hl) => {
    const m = hl.match(/^(.*?)\s+(?:at|@)\s+(.+?)(?:\s*[|·•,(]|\s+[-–—]\s|$)/i);
    if (m) return { role: m[1].trim(), company: m[2].trim() };
    return { role: hl.split(/\s*[|·•]\s*/)[0].trim(), company: "" };
  };
  const CATS = [
    ["recruiting", /recruit|talent|hiring|\bHR\b|human resources|people (ops|operations|partner)/i, "Recruiting"],
    ["sales", /sales|business development|account executive|\bSDR\b|revenue|account manager/i, "Sales"],
    ["marketing", /marketing|growth|brand|content|\bSEO\b/i, "Marketing"],
    ["engineering", /engineer|developer|software|tech lead|\bCTO\b|devops/i, "Engineering"],
    ["product", /product (manager|owner|lead)|designer|\bUX\b|\bUI\b/i, "Product & Design"],
    ["data", /data (scien|analy|engineer)|machine learning|\bAI\b|\bML\b/i, "Data & AI"],
    ["finance", /finance|account(ant|ing)|\bCFO\b|audit/i, "Finance"],
    ["leadership", /founder|co-founder|\bCEO\b|director|\bVP\b|head of|president|managing/i, "Leadership"],
  ];
  W.category = (hl) => {
    for (const [id, rx, label] of CATS) if (rx.test(hl)) return { id, label };
    return { id: "other", label: "General" };
  };

  // ---------- seeded variation (same person + same variant = same message) ----------
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const FIELD = { recruiting: "recruiting", sales: "sales", marketing: "marketing", engineering: "engineering", product: "product", data: "data", finance: "finance", leadership: "leadership", other: "your field" };
  const hooks = (cat, C, role) => ({
    recruiting: [`I saw you recruit${C}.`, `Your talent work${C} caught my eye.`, `I noticed you hire${C}.`],
    sales: [`I noticed you work in sales${C}.`, `Your sales role${C} stood out to me.`, `I came across your profile as ${role || "a sales professional"}${C}.`],
    marketing: [`I came across your marketing work${C}.`, `Your role in marketing${C} caught my eye.`, `I noticed you work on growth${C}.`],
    engineering: [`I saw you build software${C}.`, `Your engineering work${C} caught my eye.`, `I came across your profile as ${role || "an engineer"}${C}.`],
    product: [`I noticed your product work${C}.`, `Your role in product and design${C} caught my eye.`],
    data: [`I noticed your data work${C}.`, `Your work in data and AI${C} caught my eye.`],
    finance: [`I came across your finance work${C}.`, `Your role in finance${C} caught my eye.`],
    leadership: [`I admire what you are building${C}.`, `I saw you lead${C}.`, `Your leadership role${C} caught my eye.`],
    other: [`I came across your profile${C}.`, `I saw you work as ${role || "a professional"}${C}.`],
  }[cat] || [`I came across your profile${C}.`]);

  const asks = (purpose, cat, C, T) => {
    if (purpose === "job") {
      if (cat === "recruiting") return ["If you have openings that fit, I would be glad to be considered.", "Could you tell me what you look for in candidates?", "I would appreciate being considered for any suitable roles."];
      if (cat === "leadership") return ["If your team is hiring, I would welcome a quick chat.", "Could you point me to the right person on your team?"];
      if (cat === "engineering" || cat === "data" || cat === "product") return ["If there is an opening on your team, a referral would mean a lot.", "Could I ask what your team looks for in new hires?"];
      return [`If ${T} has openings, or you could point me to the right person, that would help a lot.`, "Would you be open to sharing how your team works with new hires?", "I would be grateful for a pointer to the right contact."];
    }
    if (purpose === "net") {
      const f = FIELD[cat];
      return [`Would you be open to a quick chat about your path in ${f}?`, `I would love to learn how you got into ${f}.`, "Could I ask you two or three questions about your work?"];
    }
    return ["Would a 15-minute call next week make sense?", `Is this something you handle${C}, or should I speak with someone else?`, "Happy to share a short example if useful."];
  };

  /** o: { myName, about, goal, offer, purpose: job|net|sales, tone: pro|friendly|short, attach } */
  W.smart = (p, o, variant = 0) => {
    const r = rng(hash(`${p.name}|${p.headline}|${variant}`));
    const first = p.first || p.name.split(" ")[0];
    const cat = W.category(p.headline).id;
    const ph = W.parse(p.headline);
    const C = ph.company ? ` at ${ph.company}` : "";
    const T = ph.company || "your team";
    const hook = pick(r, hooks(cat, C, ph.role));
    const goal = o.purpose === "job" && o.goal ? `, and I am exploring ${o.goal}` : "";
    const intro = o.purpose === "sales" ? `${cap((o.offer || o.about || "").replace(/[.\s]+$/, ""))}.` : `I am ${o.about}${goal}.`;
    const file = o.attach ? (o.purpose === "job" ? "My resume is attached." : o.purpose === "sales" ? "A one-page overview is attached." : "") : "";
    const ask = pick(r, asks(o.purpose, cat, C, T));
    const greet = o.tone === "friendly" ? `Hi ${first}!` : `Hi ${first},`;
    const close = o.tone === "pro" ? "Thank you for your time." : o.tone === "friendly" ? "Thanks so much!" : "Thanks,";
    let body = o.tone === "short" ? [hook, intro, ask].join(" ") : [hook, intro, file, ask].filter(Boolean).join(" ");
    if (o.tone === "friendly") body = body.replace(/\bI would\b/g, "I'd").replace(/\bI am\b/g, "I'm");
    return `${greet}\n\n${body}\n\n${close}\n${o.myName}`;
  };

  // ---------- AI mode ----------
  W.prompt = (p, o) => {
    const first = p.first || p.name.split(" ")[0];
    const ph = W.parse(p.headline);
    const purpose = { job: "a job search", net: "networking", sales: "a sales pitch" }[o.purpose] || "networking";
    const words = o.tone === "short" ? 50 : 90;
    return [
      `Write one LinkedIn direct message from ${o.myName} to ${first} for ${purpose}.`,
      `About the sender: ${o.about}.` + (o.purpose === "job" && o.goal ? ` Looking for: ${o.goal}.` : ""),
      `About the recipient: headline "${p.headline}" (role: ${ph.role || "unknown"}; company: ${ph.company || "unknown"}).`,
      "Rules:",
      `- Tone: ${o.tone === "friendly" ? "warm and friendly" : o.tone === "short" ? "brief and direct" : "professional and polite"}. At most ${words} words.`,
      `- Start with "Hi ${first}," and end with a short sign-off and the name ${o.myName}.`,
      "- Refer naturally to the recipient's role or company, in your own words. Do not copy the headline.",
      "- Use only facts given above. Do not invent achievements, shared history, or compliments about their work.",
      "- No emojis, no hashtags, no clichés like \"I hope this message finds you well\".",
      o.attach ? "- Mention in one short sentence that a file (resume or overview) is attached." : "",
      "- Make exactly one small, specific request that suits the recipient's role.",
      "Output only the message text.",
    ].filter(Boolean).join("\n");
  };

  /** Resolves { ok:true, text } or { ok:false, error }. Never rejects. */
  W.ai = (o, p) => new Promise((resolve) => {
    if (!o.apiKey) return resolve({ ok: false, error: "no API key" });
    try {
      chrome.runtime.sendMessage(
        { type: "hr-ai", provider: o.provider, key: o.apiKey, model: o.model, prompt: W.prompt(p, o) },
        (res) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          if (!res || !res.ok) return resolve({ ok: false, error: (res && res.error) || "no response" });
          resolve({ ok: true, text: res.text });
        }
      );
    } catch (e) { resolve({ ok: false, error: String(e.message || e) }); }
  });

  self.HR_WRITER = W;
})();
