"use client";

// 📅 Next 7 days (plan, 19 Nov): each day's appointments, bids due, notice deadlines and 2nd tries. A tap opens it.
import type { WeekDay, WeekItem } from "../../lib/week-ahead";
import { weekLine } from "../../lib/week-ahead";

const ICON: Record<WeekItem["kind"], string> = { appointment: "📅", bid: "🧾", notice: "⏰", secondtry: "🔁" };

export default function WeekAhead({ week, onClose, onOpen }: { week: WeekDay[]; onClose: () => void; onOpen: (item: WeekItem) => void }) {
  return (
    <div className="fc-package-sheet fc-summary-sheet fc-week-sheet" role="dialog" aria-label="Next 7 days" data-hpd-smoke="fc-week-sheet">
      <header>
        <button type="button" onClick={onClose}>← Map</button>
        <strong>📅 Next 7 days</strong>
      </header>
      <div className="fc-summary-body">
        <p className="fc-week-line" data-hpd-smoke="fc-week-line">{weekLine(week)}</p>
        {week.map((day) => (
          <section key={day.date} data-hpd-smoke="fc-week-day" data-date={day.date}>
            <h3>{day.label} <small>({day.items.length})</small></h3>
            {day.items.length ? day.items.map((item, i) => (
              <button type="button" key={`${item.kind}-${item.omo}-${i}`} className={`fc-week-item is-${item.kind}${item.done ? " is-done" : ""}${item.late ? " is-late" : ""}`} data-hpd-smoke="fc-week-item" data-kind={item.kind} data-omo={item.omo} onClick={() => onOpen(item)}>
                <b>{ICON[item.kind]} {item.omo}</b> <span>{item.address}</span><small>{item.done ? "✓ " : ""}{item.text}</small>
              </button>
            )) : <p className="fc-week-none">Nothing booked or due.</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
