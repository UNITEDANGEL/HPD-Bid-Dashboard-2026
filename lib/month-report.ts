// 📈 The month on one page (owner idea, 4 Nov): money awarded, jobs won and finished, bids sent, win rate and the best
// boroughs and kinds of work, as a one-page PDF made on the phone (no AI, nothing sent). Share it from the chat.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type MonthReport = {
  month: string; // "November 2026"
  soFar: boolean; // the month isn't over yet
  won: number;
  awarded: number;
  finished: number;
  noAccess: number;
  earned: number;
  bidsSent: number;
  boroughs: { name: string; won: number; awarded: number }[];
  kinds: { name: string; won: number }[];
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// The few lines the robot says about the report.
export function monthSummary(r: MonthReport) {
  const rate = r.bidsSent ? Math.round((r.won / r.bidsSent) * 100) : 0;
  const best = r.boroughs[0];
  return `📈 ${r.month}${r.soFar ? " so far" : ""}: ${r.won} job${r.won === 1 ? "" : "s"} won (${money(r.awarded)} awarded), ${r.finished} finished, ${r.bidsSent} bid${r.bidsSent === 1 ? "" : "s"} sent${rate ? ` (${rate}% won)` : ""}.${best && best.won ? ` Best borough: ${best.name} with ${best.won}.` : ""} The one-page report is ready below.`;
}

export async function monthReportPdf(r: MonthReport, company = "United Angel Construction Corp."): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.month} report`);
  const page = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.06, 0.09, 0.16), soft = rgb(0.39, 0.45, 0.55), blue = rgb(0.15, 0.39, 0.92);
  let y = 740;
  page.drawText(company, { x: 50, y, size: 12, font, color: soft });
  y -= 30;
  page.drawText(`${r.month}${r.soFar ? " (so far)" : ""}`, { x: 50, y, size: 26, font: bold, color: ink });
  y -= 18;
  page.drawText("HPD emergency repair work, one page", { x: 50, y, size: 11, font, color: soft });
  // Six number tiles, two rows of three.
  const rate = r.bidsSent ? `${Math.round((r.won / r.bidsSent) * 100)}%` : "-";
  const tiles: [string, string][] = [["Money awarded", money(r.awarded)], ["Jobs won", String(r.won)], ["Win rate", rate], ["Jobs finished", String(r.finished)], ["Bids sent", String(r.bidsSent)], ["Earned from finished jobs", money(r.earned)]];
  y -= 40;
  tiles.forEach(([label, value], i) => {
    const x = 50 + (i % 3) * 172, top = y - Math.floor(i / 3) * 86;
    page.drawRectangle({ x, y: top - 70, width: 160, height: 72, color: rgb(0.94, 0.96, 0.99), borderColor: rgb(0.8, 0.85, 0.92), borderWidth: 1 });
    page.drawText(value, { x: x + 12, y: top - 36, size: 22, font: bold, color: ink });
    page.drawText(label, { x: x + 12, y: top - 56, size: 10, font, color: soft });
  });
  y -= 190;
  const table = (title: string, rows: [string, string][]) => {
    page.drawText(title, { x: 50, y, size: 14, font: bold, color: ink });
    y -= 20;
    if (!rows.length) { page.drawText("None this month.", { x: 50, y, size: 11, font, color: soft }); y -= 26; return; }
    const max = Math.max(1, ...rows.map(([, v]) => Number(v.split(" ")[0]) || 0));
    for (const [name, v] of rows.slice(0, 6)) {
      const n = Number(v.split(" ")[0]) || 0;
      page.drawText(name.slice(0, 34), { x: 50, y, size: 11, font, color: ink });
      page.drawRectangle({ x: 260, y: y - 2, width: Math.max(4, (n / max) * 200), height: 12, color: blue });
      page.drawText(v, { x: 470, y, size: 11, font, color: ink });
      y -= 20;
    }
    y -= 14;
  };
  table("Jobs won by borough", r.boroughs.map((b) => [b.name, `${b.won} · ${money(b.awarded)}`]));
  table("What kind of work won", r.kinds.map((k) => [k.name, `${k.won} job${k.won === 1 ? "" : "s"}`]));
  if (r.noAccess) { page.drawText(`No access: ${r.noAccess} visit${r.noAccess === 1 ? "" : "s"} this month.`, { x: 50, y, size: 11, font, color: soft }); y -= 20; }
  page.drawText(`Made by HPD Field on ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })}. Awards come from HPD's award dates; bids sent are the ones sent from this phone.`, { x: 50, y: 40, size: 8, font, color: soft });
  return doc.save();
}
