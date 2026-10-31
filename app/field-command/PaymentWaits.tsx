"use client";

// Payment tracker (owner, 31 Oct "do 6"): every job whose paperwork went to HPD, until PIP shows it paid. Late ones
// (PIP still shows them open after 90 days) first, with what each should bring in; then the rest, folded.
import { useState } from "react";
import { PAID_RECENT_DAYS, TOO_LONG_DAYS, type PayWait, type paymentWaits } from "../../lib/pay-waiting";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const md = (iso: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}` : "");
const STATUS: Record<PayWait["status"], string> = {
  paid: "💵 paid", open: "open in PIP", "not-in-pip": "not in PIP's download", "after-pip": "sent after PIP's last download",
};

export default function PaymentWaits({ track, pipAsOfText, onOpen }: { track: ReturnType<typeof paymentWaits>; pipAsOfText: string; onOpen: (omo: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const { rows, summary } = track;
  const late = rows.filter((r) => r.tooLong);
  const rest = rows.filter((r) => !r.tooLong && r.status !== "paid");
  const paid = rows.filter((r) => r.status === "paid");
  const row = (r: PayWait) => (
    <li key={r.omo} className={`fc-paywait-row is-${r.status}${r.tooLong ? " is-late" : ""}`} data-hpd-smoke="fc-paywait-row" data-omo={r.omo}>
      <button type="button" onClick={() => onOpen(r.omo)}>
        <b>{r.omo}<em>{r.status === "paid" ? `${money(r.paid)} paid${r.paidAt ? ` ${md(r.paidAt)}` : ""}` : `${r.estimated ? "about " : ""}${money(r.amount)}`}</em></b>
        <small>{r.address || "—"}</small>
        <small>Sent {md(r.sentAt)} · {r.days} day{r.days === 1 ? "" : "s"} waiting · {STATUS[r.status]}</small>
      </button>
    </li>
  );
  return (
    <section className="fc-follow-section is-paywait" data-hpd-smoke="fc-paywait">
      <h4>💵 Every job sent: waiting for HPD to pay</h4>
      <div className="fc-money-sum" data-hpd-smoke="fc-paywait-sum">
        <span className={summary.tooLong ? "is-late" : ""}><b>{summary.tooLong}</b>late: PIP shows them open after {TOO_LONG_DAYS} days{summary.tooLongAmount ? ` · ${money(summary.tooLongAmount)}` : ""}</span>
        <span><b>{summary.waiting}</b>sent, not paid yet</span>
        <span className="is-paid"><b>{money(summary.paidAmount)}</b>paid in the last {PAID_RECENT_DAYS} days ({summary.paid})</span>
      </div>
      <p className="fc-follow-note" data-hpd-smoke="fc-paywait-note">
        From the paperwork in your Sent mail and the packages emailed from the app, checked against PIP{pipAsOfText ? ` (last brought in ${pipAsOfText})` : ""}.
        {summary.afterPip ? ` ${summary.afterPip} ${summary.afterPip === 1 ? "was" : "were"} sent after that, so ${summary.afterPip === 1 ? "it can't" : "they can't"} show as paid yet.` : ""}
        {summary.notInPip ? ` ${summary.notInPip} ${summary.notInPip === 1 ? "isn't" : "aren't"} in PIP's download at all: not counted as late. A fresh Agreement Summary from PIP fills them in.` : ""}
      </p>
      {late.length ? (
        <>
          <h5>⏰ Late: call or email HPD procurement about these</h5>
          <ul className="fc-paywait-list" data-hpd-smoke="fc-paywait-late">{late.map(row)}</ul>
        </>
      ) : <p className="fc-follow-note" data-hpd-smoke="fc-paywait-none">✓ Nothing late: no job PIP shows open for more than {TOO_LONG_DAYS} days.</p>}
      {paid.length ? (
        <details>
          <summary>💵 Paid in the last {PAID_RECENT_DAYS} days ({paid.length})</summary>
          <ul className="fc-paywait-list">{paid.map(row)}</ul>
        </details>
      ) : null}
      {rest.length ? (
        <details onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary data-hpd-smoke="fc-paywait-rest">🕓 Waiting, not late ({rest.length})</summary>
          {showAll ? <ul className="fc-paywait-list">{rest.slice(0, 150).map(row)}</ul> : null}
          {showAll && rest.length > 150 ? <p className="fc-follow-note">Showing the 150 waiting longest.</p> : null}
        </details>
      ) : null}
    </section>
  );
}
