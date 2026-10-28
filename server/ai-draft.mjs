// AI-written replies for the 24 / 72-hour board (owner, 17 Oct 2026). The AI only drafts: the owner reads and edits
// the text, and sending still takes two taps. The AI is told the facts on record and must not invent anything.
// Providers, first one set up wins: Cloudflare Workers AI (binding "AI"; stays inside Cloudflare, free tier) or
// Anthropic (secret ANTHROPIC_API_KEY). Neither set up: { ai: false } and the app keeps its ready-made reply.

const SYSTEM = [
  "You write short email replies for United Angel Construction Corp, an NYC HPD emergency repair contractor,",
  "to the HPD vendor tracking person who sent a poor performance notice (24 or 72 hours) or a missing-documents request.",
  "Rules:",
  "- Use only the facts given. Never invent dates, times, amounts, work done, visits or documents.",
  "- If the affidavit and invoice were already sent, say so with the date given and offer to resend.",
  "- If they were not sent, say they will be sent within the deadline (do not promise a time that is not given).",
  "- Follow the owner's note if there is one, without adding facts it does not give.",
  "- Polite, brief (3 to 6 sentences), plain professional English. No tenant names or phone numbers.",
  "- First line: Hello <their first name>,  Then a blank line, then: Re: OMO# <omo> - <address>",
  "- End with exactly:\nThank you,\nJot Singh\nUnited Angel Construction Corp",
  "Return only the email text, nothing else.",
].join("\n");

const clip = (v, n) => String(v ?? "").replace(/\s+\n/g, "\n").slice(0, n);

export function draftFacts(body) {
  const omo = String(body?.omo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!/^[A-Z]{2}\d{5}$/.test(omo)) return null;
  return {
    omo,
    address: clip(body.address, 120),
    from: clip(body.who, 80),
    notice: body.kind === "docs" ? `missing documents request (they asked for: ${clip(body.want, 60) || "documents / an update"})` : `${body.hours === 72 ? 72 : 24}-hour poor performance notice`,
    received: clip(body.noticeAt, 40),
    deadline: clip(body.dueAt, 40),
    hoursLeft: Number.isFinite(Number(body.hoursLeft)) ? Math.round(Number(body.hoursLeft) * 10) / 10 : null,
    paperworkOnRecord: clip(body.sentAt, 20) || "none",
    replySent: Boolean(body.steps?.replied),
    paperworkMade: Boolean(body.steps?.made),
    paperworkSentToThem: Boolean(body.steps?.sent),
    ownerNote: clip(body.note, 500),
    foundOnRecord: Array.isArray(body.found) ? body.found.slice(0, 12).map((x) => clip(x, 160)) : [],
    theirEmail: clip(body.noticeText, 2500),
  };
}

// The AI's text must be a reply to this job: names the OMO, signed, not too long.
export function cleanDraft(text, omo) {
  const t = String(text || "").replace(/^```[a-z]*\n?|```$/g, "").trim();
  if (!t || t.length > 4000 || !t.includes(omo)) return "";
  return /Jot Singh/.test(t) ? t : `${t}\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`;
}

export async function aiDraft(env, facts, fetcher = fetch) {
  const user = `Facts on record (JSON):\n${JSON.stringify(facts, null, 1)}`;
  if (env?.AI) {
    const model = env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const result = await env.AI.run(model, { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], max_tokens: 600 });
    const text = cleanDraft(typeof result?.response === "string" ? result.response : "", facts.omo);
    return text ? { ai: true, model, text } : { ai: false, reason: "The AI's answer didn't fit this job." };
  }
  if (env?.ANTHROPIC_API_KEY) {
    const model = env.ANTHROPIC_MODEL || "claude-haiku-5-5";
    const r = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return { ai: false, reason: `The AI didn't answer (HTTP ${r.status}).` };
    const d = await r.json().catch(() => ({}));
    const text = cleanDraft((d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"), facts.omo);
    return text ? { ai: true, model, text } : { ai: false, reason: "The AI's answer didn't fit this job." };
  }
  return { ai: false, reason: "not-set-up" };
}

// Questions to the app's voice helper (owner, 22 Oct: "be my personal agent, I'm able to talk to you"): a short spoken
// answer from the facts the phone sends (jobs, notices, bids, money; no tenant names). Never changes anything.
const ASK_SYSTEM = [
  "You are the voice helper inside HPD Field, the app of United Angel Construction Corp (an NYC HPD emergency repair contractor).",
  "The owner asks you a question out loud; you answer out loud.",
  "Rules:",
  "- Use only the facts given (JSON). If the answer isn't in them, say you don't have that in the app yet.",
  "- Never invent jobs, dates, amounts, people or documents. Say job numbers exactly as given.",
  "- Short: 1 to 4 sentences, plain spoken English, no lists, no markdown, no emojis.",
  "- recentConversation (in the facts) is what the owner and you just said: use it for follow-ups like 'that one', 'text them' or 'and the other job'.",
  "- You never send, save or change anything yourself. When the owner wants the app to do something, add one line per",
  "  action that starts with 'DO: ' followed by exactly one of these commands (the app runs it and asks for a yes or a tap",
  "  where needed): 'text the tenant for <job>', 'call the tenant for <job>', 'take me to <job>', 'take me to the next stop',",
  "  'open <job>', 'read me <job>', 'plan my day', 'answer the notice for <job>', 'do the paperwork for <job>',",
  "  'make an appointment for <job> <day> at <time>', 'remind me to <what> <day> at <time>', 'read me the new bids', \"what's left on <job>\", 'how much does HPD owe me', 'how did I do this week', 'show my job tracker', \"which tenants haven't answered\",",
  "  'what do I have today'. <job> is a job number from the facts, e.g. EQ15239; <day> is today, tomorrow, a weekday or",
  "  10/27; <time> is like 10am or 2:30pm. Put the spoken answer first, then the DO lines. At most 3 DO lines.",
  "- When the owner wants the app itself changed or improved (a new feature, a different look, something that works badly,",
  "  something to add to the app), say you're passing it to Claude, and add: 'DO: send to Claude: <their wish, in their words>'.",
  "  Claude is the developer who upgrades the app; he reads these requests and builds them.",
  "- If the owner sounds unhappy with the app (slow, confusing, can't find something, it didn't work), offer to pass it to",
  "  Claude and add the 'DO: send to Claude: …' line with what's wrong, in their words.",
  "- Think ahead: facts.nextStep is the most pressing thing right now. If the question doesn't already cover it, end with",
  "  one short sentence bringing it up (e.g. 'Also, notice ER03009 has 2 hours left.').",
  "- facts.weather is New York's forecast (today and tomorrow) and facts.traffic the rush-hour note. Use them when they",
  "  matter for the work: rain or wind on roof / outside jobs, freezing on plaster or paint, getting dark before photos,",
  "  rush hour on the drive. Mention them only when they help.",
].join("\n");

export function askFacts(body) {
  const q = clip(body?.question, 300).trim();
  if (q.length < 3) return null;
  let facts = body?.facts && typeof body.facts === "object" ? body.facts : {};
  let json = JSON.stringify(facts);
  if (json.length > 12000) { json = json.slice(0, 12000); facts = { note: "facts cut to fit", partial: json }; }
  return { question: q, facts };
}

export async function aiAnswer(env, ask, fetcher = fetch) {
  const user = `Facts from the app (JSON):\n${JSON.stringify(ask.facts)}\n\nQuestion: ${ask.question}`;
  // DO lines (app actions the AI chose) stay on their own lines; the rest is one spoken paragraph.
  const clean = (t) => {
    const lines = String(t || "").replace(/[*#`_]/g, "").split(/\r?\n/);
    const dos = lines.map((l) => l.trim()).filter((l) => /^DO:\s*\S/i.test(l)).slice(0, 3).map((l) => `DO: ${l.replace(/^DO:\s*/i, "").slice(0, 160)}`);
    const said = lines.filter((l) => !/^\s*DO:/i.test(l)).join(" ").replace(/\s+/g, " ").trim().slice(0, 700);
    return [said, ...dos].filter(Boolean).join("\n");
  };
  if (env?.AI) {
    const model = env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const result = await env.AI.run(model, { messages: [{ role: "system", content: ASK_SYSTEM }, { role: "user", content: user }], max_tokens: 350 });
    const text = clean(typeof result?.response === "string" ? result.response : "");
    return text ? { ai: true, model, text } : { ai: false, reason: "The AI gave no answer." };
  }
  if (env?.ANTHROPIC_API_KEY) {
    const model = env.ANTHROPIC_MODEL || "claude-haiku-5-5";
    const r = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 350, system: ASK_SYSTEM, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return { ai: false, reason: `The AI didn't answer (HTTP ${r.status}).` };
    const d = await r.json().catch(() => ({}));
    const text = clean((d.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" "));
    return text ? { ai: true, model, text } : { ai: false, reason: "The AI gave no answer." };
  }
  return { ai: false, reason: "not-set-up" };
}
