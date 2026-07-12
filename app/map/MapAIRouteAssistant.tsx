"use client";

import { FormEvent, useMemo, useState } from "react";

type RouteIntent = "nearby" | "borough" | "urgent" | "appointments" | "manual";
type Borough = "Queens" | "Brooklyn" | "Bronx" | "Manhattan" | "Staten Island";

const BOROUGHS: Borough[] = ["Queens", "Brooklyn", "Bronx", "Manhattan", "Staten Island"];

function intentLabel(intent: RouteIntent, borough: Borough | null) {
  if (intent === "nearby") return "jobs near your current location";
  if (intent === "borough") return borough ? `${borough} jobs` : "jobs in a borough";
  if (intent === "urgent") return "urgent and overdue jobs";
  if (intent === "appointments") return "today's appointment jobs";
  return "jobs you select manually";
}

export default function MapAIRouteAssistant() {
  const [intent, setIntent] = useState<RouteIntent | null>(null);
  const [borough, setBorough] = useState<Borough | null>(null);
  const [stopCount, setStopCount] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "review">("idle");

  const summary = useMemo(() => {
    if (!intent) return "";
    return `I’ll find ${stopCount} ${intentLabel(intent, borough)}, starting from your current location, then arrange them in the best travel order.`;
  }, [intent, borough, stopCount]);

  function choose(nextIntent: RouteIntent) {
    setIntent(nextIntent);
    if (nextIntent !== "borough") setBorough(null);
    setStatus("review");
  }

  function submitPrompt(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim().toLowerCase();
    if (!value) return;
    const foundBorough = BOROUGHS.find((item) => value.includes(item.toLowerCase())) || null;
    setBorough(foundBorough);
    if (foundBorough) setIntent("borough");
    else if (value.includes("urgent") || value.includes("overdue")) setIntent("urgent");
    else if (value.includes("appointment")) setIntent("appointments");
    else if (value.includes("near")) setIntent("nearby");
    else setIntent("manual");
    const count = value.match(/\b([2-9]|10)\b/)?.[1];
    if (count) setStopCount(Number(count));
    setStatus("review");
  }

  function requestRoute() {
    if (!intent) return;
    window.dispatchEvent(
      new CustomEvent("hpd:ai-route-request", {
        detail: { intent, borough, stopCount, prompt: prompt.trim() },
      }),
    );
    setStatus("review");
  }

  function reset() {
    setIntent(null);
    setBorough(null);
    setPrompt("");
    setStatus("idle");
  }

  return (
    <aside className="map-ai-route-assistant" aria-label="AI route assistant">
      <div className="map-ai-route-assistant__header">
        <div>
          <span className="map-ai-route-assistant__eyebrow">AI ROUTE ASSISTANT</span>
          <h2>Where should I route you today?</h2>
        </div>
        {intent ? (
          <button type="button" className="map-ai-route-assistant__reset" onClick={reset}>
            Start over
          </button>
        ) : null}
      </div>

      {status === "idle" ? (
        <>
          <div className="map-ai-route-assistant__quick-grid">
            <button type="button" onClick={() => choose("nearby")}>
              <strong>Near me</strong>
              <span>Use my current location</span>
            </button>
            <button type="button" onClick={() => choose("borough")}>
              <strong>Pick a borough</strong>
              <span>Queens, Brooklyn and more</span>
            </button>
            <button type="button" onClick={() => choose("urgent")}>
              <strong>Urgent jobs</strong>
              <span>Prioritize overdue work</span>
            </button>
            <button type="button" onClick={() => choose("appointments")}>
              <strong>Appointments</strong>
              <span>Route today’s scheduled stops</span>
            </button>
          </div>

          <form className="map-ai-route-assistant__prompt" onSubmit={submitPrompt}>
            <label htmlFor="map-ai-route-prompt">Or ask AI</label>
            <div>
              <input
                id="map-ai-route-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Example: Route 5 urgent jobs in Queens"
              />
              <button type="submit">Ask AI</button>
            </div>
          </form>
        </>
      ) : (
        <div className="map-ai-route-assistant__review">
          {intent === "borough" ? (
            <div className="map-ai-route-assistant__boroughs">
              {BOROUGHS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={borough === item ? "is-selected" : ""}
                  onClick={() => setBorough(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}

          <div className="map-ai-route-assistant__message">
            <span>AI PLAN</span>
            <p>{summary}</p>
          </div>

          <div className="map-ai-route-assistant__count">
            <span>Number of stops</span>
            {[3, 5, 6].map((count) => (
              <button
                type="button"
                key={count}
                className={stopCount === count ? "is-selected" : ""}
                onClick={() => setStopCount(count)}
              >
                {count}
              </button>
            ))}
          </div>

          <div className="map-ai-route-assistant__actions">
            <button type="button" className="secondary" onClick={reset}>
              Change choice
            </button>
            <button type="button" className="primary" onClick={requestRoute} disabled={intent === "borough" && !borough}>
              Find best route
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
