"use client";

import { useState } from "react";
import { answerFieldQuestion } from "../../lib/field-assistant";
import { packageReadiness } from "../../lib/package-readiness";

export default function JobAssistant({ job, id, media }: { job: Record<string, unknown>; id: string; media: { before: number; after: number } | null }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [mode, setMode] = useState<"guidance" | "package">("guidance");
  const check = packageReadiness(job, media);
  const answer = asked ? answerFieldQuestion(asked, [job], id) : null;
  return <details className="jc-assistant">
    <summary>Job assistant <span>Free · {id}</span></summary>
    <div className="jc-assistant-actions">
      <button type="button" onClick={() => { setAsked("What next?"); setMode("guidance"); }}>Next step</button>
      <button type="button" onClick={() => { setAsked("Can I revisit?"); setMode("guidance"); }}>Visit check</button>
      <button type="button" onClick={() => setMode("package")}>Package check</button>
    </div>
    <form onSubmit={event => { event.preventDefault(); if (question.trim()) { setAsked(question.trim()); setQuestion(""); setMode("guidance"); } }}>
      <label htmlFor={`assistant-${id}`}>Ask about {id}</label>
      <div className="jc-assistant-input"><input id={`assistant-${id}`} value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} /><button type="submit" disabled={!question.trim()}>Ask</button></div>
    </form>
    <div role="status" aria-live="polite">
      {mode === "package" ? <><strong>{check.template}</strong>{check.issues.length ? <ul>{check.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>No missing items detected in this limited pre-check.</p>}<p>{check.review}</p></> : asked ? <p>{answer?.text || "Route planning is available in Map menu > Plan my day. This assistant checks only the open job."}</p> : null}
    </div>
  </details>;
}
