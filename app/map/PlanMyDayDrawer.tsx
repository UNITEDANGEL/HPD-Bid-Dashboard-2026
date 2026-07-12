"use client";

import { FormEvent, useMemo, useState } from "react";

type Role = "assistant" | "user";
type ChatMessage = { id: string; role: Role; text: string };
type StructuredPlan = {
  start_mode: "current_location" | "office" | "custom";
  start_location_text: string | null;
  boroughs: string[];
  avoid_boroughs: string[];
  priorities: string[];
  stop_count: number;
  include_omo: string[];
  exclude_omo: string[];
  finish_by: string | null;
  route_preference: "shortest_drive" | "highest_priority" | "balanced" | "appointments_first";
  notes: string[];
};

type PlannerResponse = {
  reply: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  plan_ready: boolean;
  plan: StructuredPlan;
  response_id: string | null;
  error?: string;
};

const QUICK_PROMPTS = [
  "Plan 5 jobs near me",
  "Plan urgent and overdue jobs",
  "Plan today's appointments",
  "Plan the shortest Queens route",
];

const EMPTY_PLAN: StructuredPlan = {
  start_mode: "current_location",
  start_location_text: null,
  boroughs: [],
  avoid_boroughs: [],
  priorities: [],
  stop_count: 5,
  include_omo: [],
  exclude_omo: [],
  finish_by: null,
  route_preference: "balanced",
  notes: [],
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function planSummary(plan: StructuredPlan) {
  const items: string[] = [];
  items.push(`${plan.stop_count} stops`);
  items.push(plan.start_mode === "current_location" ? "start near me" : plan.start_mode === "office" ? "start at office" : `start at ${plan.start_location_text || "custom location"}`);
  if (plan.boroughs.length) items.push(plan.boroughs.join(", "));
  if (plan.priorities.length) items.push(plan.priorities.join(", "));
  if (plan.avoid_boroughs.length) items.push(`avoid ${plan.avoid_boroughs.join(", ")}`);
  if (plan.finish_by) items.push(`finish by ${plan.finish_by}`);
  items.push(plan.route_preference.replaceAll("_", " "));
  return items.join(" · ");
}

export default function PlanMyDayDrawer() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const [plan, setPlan] = useState<StructuredPlan>(EMPTY_PLAN);
  const [planReady, setPlanReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      text: "Good morning. Tell me how you want to plan today. You can mention boroughs, urgency, appointments, specific OMO numbers, stop count, finish time, or the shortest drive.",
    },
  ]);

  const summary = useMemo(() => planSummary(plan), [plan]);

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || sending) return;

    setMessages((current) => [...current, { id: uid(), role: "user", text }]);
    setInput("");
    setSending(true);
    setError("");
    setAccepted(false);

    try {
      const response = await fetch("/api/ai-day-planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          previousResponseId,
          currentPlan: plan,
        }),
      });
      const data = (await response.json()) as PlannerResponse;
      if (!response.ok || data.error) throw new Error(data.error || "The AI planner could not respond.");

      setPreviousResponseId(data.response_id || null);
      setPlan(data.plan);
      setPlanReady(Boolean(data.plan_ready));
      const assistantText = data.clarification_question
        ? `${data.reply}\n\n${data.clarification_question}`
        : data.reply;
      setMessages((current) => [...current, { id: uid(), role: "assistant", text: assistantText }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The AI planner could not respond.";
      setError(message);
      setMessages((current) => [...current, { id: uid(), role: "assistant", text: `I could not complete that request: ${message}` }]);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function acceptPlan() {
    const detail = { ...plan, acceptedAt: new Date().toISOString() };
    window.sessionStorage.setItem("hpd-plan-my-day-approved", JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("hpd:plan-my-day-approved", { detail }));
    setAccepted(true);
    setMessages((current) => [
      ...current,
      {
        id: uid(),
        role: "assistant",
        text: "Plan approved. I saved the structured route request for the map-routing upgrade.",
      },
    ]);
  }

  function reset() {
    setInput("");
    setSending(false);
    setError("");
    setPreviousResponseId(null);
    setPlan(EMPTY_PLAN);
    setPlanReady(false);
    setAccepted(false);
    setMessages([
      {
        id: uid(),
        role: "assistant",
        text: "Let’s start over. Describe the day you want to plan.",
      },
    ]);
  }

  return (
    <aside className={`plan-my-day ${open ? "is-open" : ""}`} aria-label="Plan My Day AI assistant">
      <button type="button" className="plan-my-day__toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>AI</span>
        <strong>Plan My Day</strong>
        <b>{open ? "Close" : "Chat"}</b>
      </button>

      {open ? (
        <section className="plan-my-day__panel">
          <header className="plan-my-day__header">
            <div>
              <span>OPENAI DAY PLANNER</span>
              <h2>Plan the day by chatting</h2>
            </div>
            <button type="button" onClick={reset}>New chat</button>
          </header>

          <div className="plan-my-day__conversation" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`plan-my-day__bubble is-${message.role}`}>
                <small>{message.role === "assistant" ? "AI planner" : "You"}</small>
                <p>{message.text}</p>
              </article>
            ))}
            {sending ? (
              <article className="plan-my-day__bubble is-assistant is-thinking">
                <small>AI planner</small>
                <p>Thinking through your route…</p>
              </article>
            ) : null}
          </div>

          {!messages.some((message) => message.role === "user") ? (
            <div className="plan-my-day__suggestions" aria-label="Suggested planning prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button type="button" key={prompt} onClick={() => void sendMessage(prompt)} disabled={sending}>{prompt}</button>
              ))}
            </div>
          ) : null}

          <form className="plan-my-day__composer" onSubmit={submit}>
            <label htmlFor="plan-my-day-chat">Message the planner</label>
            <div>
              <textarea
                id="plan-my-day-chat"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Example: Plan 6 urgent Queens jobs near me, include EQ24929, avoid Manhattan, and finish by 3 PM."
                rows={3}
                disabled={sending}
              />
              <button type="submit" disabled={sending || !input.trim()}>{sending ? "Sending…" : "Send"}</button>
            </div>
          </form>

          {error ? <div className="plan-my-day__error" role="alert">{error}</div> : null}

          <section className={`plan-my-day__plan ${planReady ? "is-ready" : ""}`}>
            <div>
              <span>{planReady ? "PLAN READY" : "WORKING PLAN"}</span>
              <p>{summary}</p>
            </div>
            <div className="plan-my-day__plan-actions">
              <button type="button" onClick={() => setInput("Change the plan: ")}>Change plan</button>
              <button type="button" className="primary" onClick={acceptPlan} disabled={!planReady || accepted}>
                {accepted ? "Plan accepted" : "Accept plan"}
              </button>
            </div>
          </section>
        </section>
      ) : null}
    </aside>
  );
}
