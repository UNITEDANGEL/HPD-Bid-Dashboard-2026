// AI-written replies for the 24 / 72-hour board (owner, 17 Oct 2026). The AI only drafts: the owner reads and edits
// the text, and sending still takes two taps. The AI is told the facts on record and must not invent anything.
// Providers, first one set up wins: Cloudflare Workers AI (binding "AI"; stays inside Cloudflare, free tier) or
// Anthropic (secret ANTHROPIC_API_KEY). Neither set up: { ai: false } and the app keeps its ready-made reply.
import { APP_GUIDE } from "../lib/app-guide.mjs";

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
  "- Three kinds of questions: (1) about the owner's work (jobs, bids, notices, money, appointments, the day): answer from",
  "  the facts (JSON) only, and do the math for them (count, add up, compare, find the soonest / oldest / biggest). If the",
  "  answer isn't in the facts, say exactly what's missing and where in the app to look. (2) how to use the app (where is,",
  "  how do I, what does this button do, can the app…): answer from the APP GUIDE below, naming the exact buttons. If the",
  "  app can't do it yet, say so and offer to pass it to Claude. (3) general questions (construction and repair know-how,",
  "  NYC HPD / housing rules in general, materials, prices of supplies, math, words): answer from general knowledge in",
  "  plain words, and say 'check with HPD' where rules matter.",
  "- facts.myNotes are things the owner told you to remember (prices he likes, how an inspector wants things, a",
  "  building's door code area…): use them in every answer they touch. When he tells you something worth keeping",
  "  ('I always bid doors at 450', 'Lewis wants photos first'), add 'DO: remember <it, in his words>'.",
  "- facts.allJobs is every open job in short (job number, address, borough, stage: todo / closeout / secondtry /",
  "  waiting, status, award and due dates, amount, a note): use it for any question about a job or a group of jobs (which",
  "  ones in Queens, the oldest, the biggest, what's waiting on HPD), and count or add from it.",
  "- facts.trends is the last 3 months (bids sent, jobs won, money awarded, win rate, what kind of work won): use it for",
  "  'how am I doing', 'is my win rate going down', 'what wins most'; say the numbers and what changed. The current month",
  "  is only daysCounted days so far, and HPD awards come about 1 to 3 weeks after the bid: compare fairly (per day, or",
  "  say it's too early) instead of calling a short month a drop.",
  "- facts.hpdEmails (when he asks about emails) has the full text of HPD's newest emails: quote the part that answers.",
  "- If the question could mean more than one job, notice, bid or person in the facts and you can't tell which, don't",
  "  guess: ask one short question naming the choices ('The one on 90th Street, EQ15239, or on Adams, ER01987?').",
  "- Answer in the language the owner used (Spanish question = Spanish answer, and Spanish ASK lines); DO lines always",
  "  stay in English exactly as listed.",
  "- At the very end add up to 2 lines 'ASK: <the next question he'd likely want>' (short, specific, with job numbers when",
  "  it helps, e.g. 'ASK: Which bids did I lose this month?'). They become buttons; skip them if nothing obvious follows.",
  "- Be smart and helpful like a sharp office manager: give the straight answer first (a number, yes / no, a job number),",
  "  then the one detail that matters. Never answer a question with only 'open the list'.",
  "- Never invent jobs, dates, amounts, people or documents. Say job numbers exactly as given.",
  "- Talk like a real person riding along with him, a friendly sharp coworker, not a computer: plain spoken English with",
  "  contractions (you've, it's, there's), 1 to 4 short sentences that sound natural out loud, no lists, no markdown, no",
  "  emojis. React like a person would ('Nice, that's 3 wins this week.', 'Ouch, that one's 2 days late.', 'Good news:').",
  "  Use his name (facts.ownerName) now and then, not every time. Vary how you start; never repeat his question back, and",
  "  never say 'based on the facts', 'according to the data', 'as an AI' or 'I hope this helps'. If it helps the",
  "  conversation, end with one short natural question back ('Want me to text the tenant?') instead of an ASK line.",
  "- facts.earlierDays is what you two talked about on the last few days (with the day): if something there was left",
  "  open and matters now (a missing video, a tenant to call back), bring it up once, naturally ('Yesterday you asked about",
  "  ER07663's video: did it go out?'). Don't repeat old answers.",
  "- The earlier messages are what the owner and you just said: use them for follow-ups like 'why?', 'and tomorrow?', 'that one', 'text them' or 'and the other job'. A short follow-up is about the last answer.",
  "- You never send, save or change anything yourself. When the owner wants the app to do something, add one line per",
  "  action that starts with 'DO: ' followed by exactly one of these commands (the app runs it and asks for a yes or a tap",
  "  where needed): 'text the tenant for <job>', 'call the tenant for <job>', 'take me to <job>', 'take me to the next stop',",
  "  'open <job>', 'read me <job>', 'plan my day', 'answer the notice for <job>', 'do the paperwork for <job>',",
  "  'make an appointment for <job> <day> at <time>', 'remind me to <what> <day> at <time>', 'read me the new bids', \"what's left on <job>\", 'how much does HPD owe me', 'how did I do this week', 'show my job tracker', \"which tenants haven't answered\",",
  "  'what do I have today', 'remember <what>', 'show me the bids', 'which notices are open'. 'take me to' is only for a job (driving there). <job> is a job number from the facts, e.g. EQ15239; <day> is today, tomorrow, a weekday or",
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
  "",
  "APP GUIDE (how HPD Field works):",
  APP_GUIDE,
].join("\n");

// The facts fit the AI (about 20,000 characters): the longest lists are shortened, never cut mid-way (a cut JSON
// string was garbage to the AI, 4 Nov).
export function fitFacts(facts, max = 20000) {
  let f = facts;
  for (let round = 0; round < 12 && JSON.stringify(f).length > max; round++) {
    const lists = Object.entries(f).filter(([, v]) => Array.isArray(v) && v.length > 3).sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length);
    if (!lists.length) break;
    const [k, v] = lists[0];
    f = { ...f, [k]: v.slice(0, Math.ceil(v.length / 2)), [`${k}Note`]: `only the first ${Math.ceil(v.length / 2)} of ${(f[`${k}Total`] || v.length)} shown` , [`${k}Total`]: f[`${k}Total`] || v.length };
  }
  if (JSON.stringify(f).length > max) f = { note: "too many facts; ask about one job or one list", nextStep: facts.nextStep || "", now: facts.now || "" };
  return f;
}

export function askFacts(body) {
  const q = clip(body?.question, 300).trim();
  if (q.length < 3) return null;
  const raw = body?.facts && typeof body.facts === "object" ? { ...body.facts } : {};
  // The conversation so far goes to the AI as real turns (owner, 4 Nov: "much smarter... like a real chat"), so
  // "why?", "and tomorrow?" or "text him" follow on from what was just said.
  const history = (Array.isArray(raw.recentConversation) ? raw.recentConversation : []).slice(-6)
    .map((t) => ({ you: clip(t?.you, 300).trim(), helper: clip(t?.helper, 600).trim() }))
    .filter((t) => t.you && t.helper);
  delete raw.recentConversation;
  return { question: q, facts: fitFacts(raw), history };
}

// The backup model (also free on Workers AI) answers when the big one is busy or out of today's allowance.
export const ASK_BACKUP_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

// DO lines (app actions the AI chose) stay on their own lines; the rest is one spoken paragraph.
export function cleanAnswer(t) {
  const lines = String(t || "").replace(/[*#`_]/g, "").split(/\r?\n/);
  const dos = lines.map((l) => l.trim()).filter((l) => /^DO:\s*\S/i.test(l)).slice(0, 3).map((l) => `DO: ${l.replace(/^DO:\s*/i, "").slice(0, 160)}`);
  const asks = lines.map((l) => l.trim()).filter((l) => /^ASK:\s*\S/i.test(l)).slice(0, 2).map((l) => `ASK: ${l.replace(/^ASK:\s*/i, "").slice(0, 90)}`);
  const said = lines.filter((l) => !/^\s*(DO|ASK):/i.test(l)).join(" ").replace(/\s+/g, " ").trim().slice(0, 900);
  return [said, ...dos, ...asks].filter(Boolean).join("\n");
}

function askMessages(ask) {
  const user = `Facts from the app (JSON):\n${JSON.stringify(ask.facts)}\n\nQuestion: ${ask.question}`;
  const history = Array.isArray(ask.history) ? ask.history : [];
  return [{ role: "system", content: ASK_SYSTEM }, ...history.flatMap((t) => [{ role: "user", content: t.you }, { role: "assistant", content: t.helper }]), { role: "user", content: user }];
}

// 🗣 The robot starts talking right away (idea list, 6 Nov): the same answer, word by word as the AI writes it (one
// JSON line per piece: {"t":"..."}, then {"done":true,"ai":true,"text":...} with the cleaned whole answer), so the phone
// says the first sentence while the rest is still coming. Workers AI only (free); null = answer the normal way.
export async function aiAnswerStream(env, ask) {
  if (!env?.AI) return null;
  const messages = askMessages(ask);
  const models = [env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ASK_BACKUP_MODEL];
  const enc = new TextEncoder();
  const line = (o) => enc.encode(`${JSON.stringify(o)}\n`);
  for (const model of models) {
    let src;
    try { src = await env.AI.run(model, { messages, max_tokens: 450, stream: true }); } catch { continue; }
    if (!src || typeof src.getReader !== "function") {
      const text = cleanAnswer(typeof src?.response === "string" ? src.response : "");
      if (!text) continue;
      return new ReadableStream({ start(c) { c.enqueue(line({ t: text })); c.enqueue(line({ done: true, ai: true, model, text })); c.close(); } });
    }
    return new ReadableStream({
      async start(c) {
        const reader = src.getReader();
        const dec = new TextDecoder();
        let buf = "", full = "";
        const take = (raw) => {
          const l = raw.trim();
          if (!l.startsWith("data:")) return;
          const data = l.slice(5).trim();
          if (!data || data === "[DONE]") return;
          try { const j = JSON.parse(data); const t = typeof j.response === "string" ? j.response : ""; if (t) { full += t; c.enqueue(line({ t })); } } catch { /* a broken piece */ }
        };
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
          }
          take(buf);
        } catch { /* cut off: what came is the answer */ }
        const text = cleanAnswer(full);
        c.enqueue(line(text ? { done: true, ai: true, model, text } : { done: true, ai: false, reason: "The AI gave no answer." }));
        c.close();
      },
    });
  }
  return null;
}

export async function aiAnswer(env, ask, fetcher = fetch) {
  const user = `Facts from the app (JSON):\n${JSON.stringify(ask.facts)}\n\nQuestion: ${ask.question}`;
  const history = Array.isArray(ask.history) ? ask.history : [];
  const clean = cleanAnswer;
  if (env?.AI) {
    const messages = [{ role: "system", content: ASK_SYSTEM }, ...history.flatMap((t) => [{ role: "user", content: t.you }, { role: "assistant", content: t.helper }]), { role: "user", content: user }];
    const models = [env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ASK_BACKUP_MODEL];
    let reason = "The AI gave no answer.";
    for (const model of models) {
      try {
        const result = await env.AI.run(model, { messages, max_tokens: 450 });
        const text = clean(typeof result?.response === "string" ? result.response : "");
        if (text) return { ai: true, model, text };
      } catch (e) { reason = `The AI is busy right now (${String(e?.message || e).slice(0, 80)}).`; }
    }
    return { ai: false, reason };
  }
  if (env?.ANTHROPIC_API_KEY) {
    const model = env.ANTHROPIC_MODEL || "claude-haiku-5-5";
    const r = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 350, system: ASK_SYSTEM, messages: [...history.flatMap((t) => [{ role: "user", content: t.you }, { role: "assistant", content: t.helper }]), { role: "user", content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return { ai: false, reason: `The AI didn't answer (HTTP ${r.status}).` };
    const d = await r.json().catch(() => ({}));
    const text = clean((d.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" "));
    return text ? { ai: true, model, text } : { ai: false, reason: "The AI gave no answer." };
  }
  return { ai: false, reason: "not-set-up" };
}

// 🔁 Talk with the tenant in their language (owner idea, 4 Nov): Cloudflare's own translation model (free daily
// allowance). English <-> Spanish, Chinese, Russian; one spoken line at a time, nothing kept.
export const TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";
export const TRANSLATE_LANGS = ["en", "es", "zh", "ru"];
export function translateFacts(body) {
  const text = clip(body?.text, 600).replace(/\s+/g, " ").trim();
  const from = String(body?.from || "").slice(0, 2).toLowerCase(), to = String(body?.to || "").slice(0, 2).toLowerCase();
  if (!text || !TRANSLATE_LANGS.includes(from) || !TRANSLATE_LANGS.includes(to) || from === to) return null;
  return { text, from, to };
}
export async function aiTranslate(env, t) {
  if (!env?.AI) return { ai: false, reason: "not-set-up" };
  const result = await env.AI.run(TRANSLATE_MODEL, { text: t.text, source_lang: t.from, target_lang: t.to });
  const text = String(result?.translated_text || "").replace(/\s+/g, " ").trim().slice(0, 900);
  return text ? { ai: true, model: TRANSLATE_MODEL, text } : { ai: false, reason: "The AI gave no translation." };
}

// 📷 Read a photo (owner, 3 Nov, pick 5 of making the chat smarter): a picture of a notice, invoice, work order or
// sign, read by Cloudflare's own vision model (the free daily allowance; the phone allows 15 a day). Nothing is kept.
// The model asks for its license to be accepted once ("agree"), done here when it says so.
export const PHOTO_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const PHOTO_SYSTEM = [
  "You read photos for a NYC contractor who does HPD (Housing Preservation and Development) emergency repair jobs.",
  "The photo is usually an HPD notice, a work order, an invoice, an affidavit, a building sign or the work itself.",
  "Answer in plain short sentences: what it is, the job number (OMO, like EQ12345 or ER08092) if you see one,",
  "dates and deadlines, amounts, and what to do next. If it's a photo of work, say what work it shows.",
  "Never write people's names or phone numbers. Don't guess what you can't read: say it's unclear. At most 5 sentences.",
].join("\n");
export function photoFacts(body) {
  const b64 = String(body?.image || "").replace(/^data:image\/[a-z]+;base64,/, "");
  if (b64.length < 200 || b64.length > 2_000_000 || /[^A-Za-z0-9+/=]/.test(b64)) return null;
  return { image: b64, question: clip(body?.question, 200).trim() || "What is this, and what should I do?" };
}
export const cleanPhoto = (t) => String(t || "").replace(/[*#`_]/g, "").replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[number]").replace(/\s+/g, " ").trim().slice(0, 700);
export async function aiReadPhoto(env, photo) {
  if (!env?.AI) return { ai: false, reason: "not-set-up" };
  const bin = atob(photo.image);
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const input = { messages: [{ role: "system", content: PHOTO_SYSTEM }, { role: "user", content: photo.question }], image: bytes, max_tokens: 400 };
  let result;
  try { result = await env.AI.run(PHOTO_MODEL, input); }
  catch (e) {
    if (!/agree|licen[cs]e|5016/i.test(String(e?.message || e))) throw e;
    await env.AI.run(PHOTO_MODEL, { prompt: "agree" });
    result = await env.AI.run(PHOTO_MODEL, input);
  }
  const text = cleanPhoto(typeof result?.response === "string" ? result.response : "");
  return text ? { ai: true, model: PHOTO_MODEL, text } : { ai: false, reason: "The AI couldn't read the photo." };
}
