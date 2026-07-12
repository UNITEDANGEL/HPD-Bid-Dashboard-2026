"use client";

import { FormEvent, useMemo, useState } from "react";

type PlanMode = "nearby" | "borough" | "urgent" | "appointments" | "custom";
type Borough = "Queens" | "Brooklyn" | "Bronx" | "Manhattan" | "Staten Island";

const BOROUGHS: Borough[] = ["Queens", "Brooklyn", "Bronx", "Manhattan", "Staten Island"];

export default function PlanMyDayDrawer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PlanMode | null>(null);
  const [borough, setBorough] = useState<Borough | null>(null);
  const [stopCount, setStopCount] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("How should I plan your day?");

  const summary = useMemo(() => {
    if (!mode) return "Choose a planning option.";
    if (mode === "nearby") return `Find ${stopCount} active jobs near your current location.`;
    if (mode === "borough") return borough ? `Find ${stopCount} priority jobs in ${borough}.` : "Choose a borough.";
    if (mode === "urgent") return `Find ${stopCount} urgent or overdue jobs.`;
    if (mode === "appointments") return `Find up to ${stopCount} jobs with appointments today.`;
    return prompt.trim() || "Describe the route you want.";
  }, [borough, mode, prompt, stopCount]);

  function choose(nextMode: PlanMode) {
    setMode(nextMode);
    if (nextMode !== "borough") setBorough(null);
    setMessage("Review your request, then ask AI to prepare the plan.");
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setMode("custom");
    setMessage("Review your request, then ask AI to prepare the plan.");
  }

  function preparePlan() {
    if (!mode || (mode === "borough" && !borough)) {
      setMessage("Choose a planning option first.");
      return;
    }

    const detail = { mode, borough, stopCount, prompt: prompt.trim() };
    window.sessionStorage.setItem("hpd-plan-my-day-request", JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("hpd:plan-my-day", { detail }));
    setMessage("Plan request saved. Route ranking will be connected in the next upgrade.");
  }

  function reset() {
    setMode(null);
    setBorough(null);
    setPrompt("");
    setMessage("How should I plan your day?");
  }

  return (
    <aside className={`plan-my-day ${open ? "is-open" : ""}`} aria-label="Plan My Day AI assistant">
      <button type="button" className="plan-my-day__toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>AI</span>
        <strong>Plan My Day</strong>
        <b>{open ? "Close" : "Open"}</b>
      </button>

      {open ? (
        <div className="plan-my-day__panel">
          <header>
            <div>
              <span>AI DAY PLANNER</span>
              <h2>Where should we work today?</h2>
            </div>
            {mode ? <button type="button" onClick={reset}>Start over</button> : null}
          </header>

          <p className="plan-my-day__message">{message}</p>

          {!mode ? (
            <>
              <div className="plan-my-day__grid">
                <button type="button" onClick={() => choose("nearby")}><strong>Near Me</strong><small>Start from your location</small></button>
                <button type="button" onClick={() => choose("borough")}><strong>Pick Borough</strong><small>Work one borough</small></button>
                <button type="button" onClick={() => choose("urgent")}><strong>Urgent / Overdue</strong><small>Prioritize time-sensitive jobs</small></button>
                <button type="button" onClick={() => choose("appointments")}><strong>Appointments</strong><small>Use today’s scheduled stops</small></button>
              </div>

              <form className="plan-my-day__prompt" onSubmit={submitCustom}>
                <label htmlFor="plan-my-day-prompt">Or ask AI</label>
                <div>
                  <input id="plan-my-day-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Plan 5 urgent jobs in Queens" />
                  <button type="submit">Ask</button>
                </div>
              </form>
            </>
          ) : (
            <div className="plan-my-day__review">
              {mode === "borough" ? (
                <div className="plan-my-day__boroughs">
                  {BOROUGHS.map((item) => (
                    <button type="button" key={item} className={borough === item ? "is-selected" : ""} onClick={() => setBorough(item)}>{item}</button>
                  ))}
                </div>
              ) : null}

              <div className="plan-my-day__summary">
                <span>YOUR REQUEST</span>
                <p>{summary}</p>
              </div>

              <div className="plan-my-day__stops">
                <span>Stops</span>
                {[3, 5, 6].map((count) => (
                  <button type="button" key={count} className={stopCount === count ? "is-selected" : ""} onClick={() => setStopCount(count)}>{count}</button>
                ))}
              </div>

              <button type="button" className="plan-my-day__prepare" onClick={preparePlan}>Prepare My Plan</button>
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}
