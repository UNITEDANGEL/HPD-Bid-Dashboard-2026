"use client";

import { useEffect } from "react";

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function clickTab(label: RegExp) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"))
    .find((candidate) => label.test(textOf(candidate)));
  button?.click();
}

function clearNativeInput(input: HTMLInputElement) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function summaryParts() {
  const summary = document.querySelector<HTMLElement>(".hpd-ai-smart-summary");
  if (!summary) return null;
  const recommendation = textOf(summary.querySelector(".hpd-ai-smart-summary-head b"));
  const reason = textOf(summary.querySelector(".hpd-ai-smart-summary-head small"));
  const cards = Array.from(summary.querySelectorAll<HTMLElement>(".hpd-ai-smart-summary-grid article"));
  const values = cards.map((card) => ({ label: textOf(card.querySelector("span")), value: textOf(card.querySelector("b")) }));
  return { summary, recommendation, reason, values };
}

function routeSummaryParts() {
  const summary = document.querySelector<HTMLElement>(".hpd-ai-route-smart-summary");
  if (!summary) return null;
  return {
    drive: textOf(summary.querySelector("b")),
    total: textOf(summary.querySelector("small")),
  };
}

function flowSummary() {
  const steps = Array.from(document.querySelectorAll<HTMLElement>(".hpd-ai-smart-flow > span"));
  const active = steps.find((step) => step.classList.contains("active"));
  const activeLabel = textOf(active?.querySelector("small") || null);
  return activeLabel || "Plan";
}

function showSmartAnswer(title: string, answer: string) {
  clickTab(/^chat\b/i);
  window.setTimeout(() => {
    const panel = document.querySelector<HTMLElement>(".hpd-ai-chat-panel");
    if (!panel) return;
    let card = panel.querySelector<HTMLElement>(".hpd-ai-smart-chat-card");
    if (!card) {
      card = document.createElement("section");
      card.className = "hpd-ai-smart-chat-card";
      panel.insertAdjacentElement("afterbegin", card);
    }
    card.innerHTML = `<span>Smart dispatch answer</span><b>${title}</b><p>${answer}</p><div><button type="button" data-smart-chat="results">Review results</button><button type="button" class="primary" data-smart-chat="start">Start recommended</button></div>`;
    card.querySelector<HTMLButtonElement>('[data-smart-chat="results"]')!.onclick = () => clickTab(/^results\b/i);
    card.querySelector<HTMLButtonElement>('[data-smart-chat="start"]')!.onclick = () => {
      const start = document.querySelector<HTMLButtonElement>('.hpd-ai-smart-summary [data-smart-action="start"]');
      start?.click();
    };
  }, 30);
}

function answerFor(command: string) {
  const normalized = command.toLowerCase();
  const results = summaryParts();
  const route = routeSummaryParts();

  if (/what.*next|next best|best next|recommend|where should i go next/.test(normalized)) {
    if (!results) return { title: "Next best job", answer: "Run a job search first. Choose a borough and select Urgent, No Access, Appointments, or Closest. I will rank the results and recommend the first stop." };
    const first = results.values.find((item) => /first stop/i.test(item.label))?.value || "ETA unavailable";
    return { title: results.recommendation || "Recommended first stop", answer: `${results.reason || "Best operational choice"}. ${first}. Review the result card, then use Start recommended or Enroute.` };
  }

  if (/eta|distance|how far|travel time|arrival|finish time|when.*arrive/.test(normalized)) {
    if (route) return { title: "Route ETA", answer: `${route.drive}. ${route.total}. These are planning estimates; the Enroute button opens Google Maps for live traffic ETA.` };
    if (!results) return { title: "ETA and distance", answer: "Run a job search first. Each result will show estimated road miles, drive minutes, and arrival time from the base or your current location." };
    const first = results.values.find((item) => /first stop/i.test(item.label))?.value || "First-stop ETA unavailable";
    const day = results.values.find((item) => /estimated day/i.test(item.label))?.value || "Day estimate unavailable";
    const source = results.values.find((item) => /calculated from/i.test(item.label))?.value || "the selected origin";
    return { title: "ETA summary", answer: `${first}. Estimated day: ${day}. Calculated from ${source}. Tap Use my location for a more relevant estimate.` };
  }

  if (/summary|summarize/.test(normalized)) {
    if (route) return { title: "Route summary", answer: `${route.drive}. ${route.total}. Open the Route tab to see ETA and distance for every leg.` };
    if (!results) return { title: "Dispatch summary", answer: "There are no ranked results yet. Ask for urgent jobs, No Access, appointments, closest jobs, or active jobs in a borough." };
    const details = results.values.map((item) => `${item.label}: ${item.value}`).join(". ");
    return { title: results.recommendation || "Dispatch summary", answer: `${results.reason}. ${details}.` };
  }

  if (/flow|workflow|steps|what.*stage/.test(normalized)) {
    return { title: `Current step: ${flowSummary()}`, answer: "The field flow is Plan → Review → Enroute → Arrive → Complete → Next. The dispatcher guides planning and travel; after Arrived, the complete job card becomes the work surface; when the card closes, the AI summary returns." };
  }

  return null;
}

export default function MapSmartConversationEnhancer() {
  useEffect(() => {
    let scheduled = false;

    const ensureQuickButtons = () => {
      const strip = document.querySelector<HTMLElement>(".hpd-ai-quick-strip");
      if (!strip) return;
      const actions: Array<[string, string]> = [
        ["best", "Best Next"],
        ["eta", "ETA Summary"],
        ["flow", "Show Flow"],
      ];
      for (const [key, label] of actions) {
        let button = strip.querySelector<HTMLButtonElement>(`[data-smart-quick="${key}"]`);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.dataset.smartQuick = key;
          button.textContent = label;
          strip.appendChild(button);
        }
        button.onclick = () => {
          const command = key === "best" ? "What should I do next?" : key === "eta" ? "Give me ETA and distance summary" : "Show me the field workflow";
          const response = answerFor(command);
          if (response) showSmartAnswer(response.title, response.answer);
        };
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        ensureQuickButtons();
      });
    };

    const onSubmit = (event: Event) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form?.classList.contains("hpd-ai-composer")) return;
      const input = form.querySelector<HTMLInputElement>("input");
      const command = input?.value.trim() || "";
      if (!command) return;
      const response = answerFor(command);
      if (!response) return;
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      if (input) clearNativeInput(input);
      showSmartAnswer(response.title, response.answer);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("submit", onSubmit, true);
    const interval = window.setInterval(schedule, 900);

    return () => {
      observer.disconnect();
      document.removeEventListener("submit", onSubmit, true);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
