// Fills an HPD Invitation to Bid with your bid: one price goes on page 1 (BID PRICE), page 2 (PAGE
// TOTAL AMOUNT) and the Work Description Form (BID AMOUNT, last page), plus everything the bid filler
// in OneDrive\HPD_BIDS_FILLER\Filler_Code fills: company, owner, address, phone, fax, date, typed
// signatures, the page 3 stamp, the work description and the permit / sidewalk bridge "NO" marks.
// Field spots come from scripts/fetch_upcoming_bids.py (found from each invitation's own labels).
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type BidField = { page: number; x: number; y: number; rotate: number; width?: number };
export type UpcomingBid = {
  notes?: string; // HPD's notes and contacts after the job description, word for word
  omo: string; address: string; borough: string; bidDue: string; bidDueTime: string;
  workStart: string; workCompletion: string; itbFile: string; description: string;
  pages: number; fields: Record<string, BidField>; lat?: number | null; lng?: number | null;
  receivedAt?: number; // when the invitation email arrived (ms)
};

// Same details as Filler_Code/fill_all_pages_FINAL_ALL_PAGES.py.
export const BID_COMPANY = {
  name: "United Angel Construction Corp.",
  owner: "Jot Singh",
  initials: "JS",
  addressLines: ["12017 91st Ave", "Richmond Hill, NY 11418"],
  phone: "718-989-1381",
  fax: "718-989-1382",
};

// "1,250.00" (the forms already print the $).
export function bidPriceText(price: number) {
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 2026-10-07 -> 10/7/26, the way the forms write dates.
export function bidDateText(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}` : iso;
}

// The work description for the Work Description Form: the OMO text up to the debris line (as the
// filler does), always ending with REMOVE ALL WORK RELATED DEBRIS.
export function bidDescription(text: string) {
  let body = String(text || "").replace(/\s+/g, " ").trim();
  const cut = body.search(/REMOVE ALL WORK[- ]RELATED DEBRIS|ALL WORK MUST BE DONE AS PER HPD SPECIFICATIONS|CONTRACTOR MUST CONTACT|IF LANDLORD REFUSES|IF NO WORK IS PERFORMED/i);
  if (cut >= 0) body = body.slice(0, cut).trim();
  body = body.replace(/^.*?(?:NYC HPD EMERGENCY OPERATIONS DIVISION\s*[-–~]\s*["“”]?\s*ESSENTIAL SERVICE WORK\s*["“”]?\s*)/i, "").trim();
  return `${body}${body ? " " : ""}REMOVE ALL WORK RELATED DEBRIS.`;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// A revised bid: the price sent before is crossed out, the new price next to it with the owner's
// initials, and a small line under it: "PRICE REVISED 1X ON 10/12/26".
export type BidRevision = { previousPrice: number; count: number; date: string };

export async function fillBidPackage(pdfBytes: ArrayBuffer | Uint8Array, bid: UpcomingBid, price: number, revision?: BidRevision): Promise<Uint8Array> {
  const previousPrice = revision?.previousPrice;
  if (!(price > 0)) throw new Error("Enter a bid price above $0.");
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const date = bidDateText(bid.bidDue);
  const amount = bidPriceText(price);
  const write = (key: string, text: string, size = 10, dy = 0) => {
    const f = bid.fields[key];
    const page: PDFPage | undefined = f ? pages[f.page] : undefined;
    if (!f || !page || !text) return;
    page.drawText(text, { x: f.x, y: f.y - dy, size, font, color: rgb(0, 0, 0.55), rotate: degrees(f.rotate || 0) });
  };
  const writePrice = (key: string, inline = false) => {
    if (!(previousPrice && previousPrice > 0 && previousPrice !== price)) return write(key, amount, 12);
    const f = bid.fields[key];
    const page: PDFPage | undefined = f ? pages[f.page] : undefined;
    if (!f || !page) return;
    const size = 12, a = ((f.rotate || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const at = (along: number, up: number) => ({ x: f.x + along * cos - up * sin, y: f.y + along * sin + up * cos });
    const oldText = bidPriceText(previousPrice!), note = `REVISED ${revision!.count}X ON ${bidDateText(revision!.date)}`;
    const grey = rgb(0.35, 0.35, 0.35), ink = rgb(0, 0, 0.55), rot = degrees(f.rotate || 0);
    const strike = (along: number, up: number, text: string, sz: number) => {
      const w = font.widthOfTextAtSize(text, sz);
      page.drawText(text, { ...at(along, up), size: sz, font, color: grey, rotate: rot });
      page.drawLine({ start: at(along - 2, up + sz * 0.35), end: at(along + w + 2, up + sz * 0.35), thickness: sz > 10 ? 1.6 : 1.2, color: rgb(0, 0, 0) });
      return w;
    };
    if (inline) {
      // Room on the line (page 1): old price crossed out, new price beside it, note underneath.
      const oldWidth = strike(0, 0, oldText, size);
      const newWidth = font.widthOfTextAtSize(amount, size);
      page.drawText(amount, { ...at(oldWidth + 10, 0), size, font, color: ink, rotate: rot });
      page.drawText(BID_COMPANY.initials, { ...at(oldWidth + 10 + newWidth + 5, size * 0.45), size: 7, font, color: ink, rotate: rot });
      page.drawText(`PRICE ${note}`, { ...at(0, -8), size: 6, font, color: ink, rotate: rot });
    } else {
      // Narrow box (page 2, Work Description Form): old price crossed out and the note on a small line
      // above, the new price with initials on the line itself.
      const oldWidth = strike(0, size + 1, oldText, 9);
      page.drawText(`REV. ${revision!.count}X ${bidDateText(revision!.date)}`, { ...at(oldWidth + 5, size + 2), size: 6, font, color: ink, rotate: rot });
      const newWidth = font.widthOfTextAtSize(amount, size);
      page.drawText(amount, { ...at(0, 0), size, font, color: ink, rotate: rot });
      page.drawText(BID_COMPANY.initials, { ...at(newWidth + 4, size * 0.45), size: 7, font, color: ink, rotate: rot });
    }
  };
  writePrice("price", true);
  writePrice("pageTotal");
  writePrice("bidAmount");
  write("contractor", BID_COMPANY.name);
  write("owner", BID_COMPANY.owner);
  write("address", BID_COMPANY.addressLines[0]);
  write("address", BID_COMPANY.addressLines[1], 10, 11);
  write("signature", BID_COMPANY.owner);
  write("date", date);
  write("phone", BID_COMPANY.phone);
  write("fax", BID_COMPANY.fax);
  write("stamp3", `${BID_COMPANY.name.toUpperCase()}   ${date}   ${BID_COMPANY.owner}`, 9);
  write("preparedBy", BID_COMPANY.owner, 9);
  write("lastSignature", BID_COMPANY.owner, 9);
  write("lastDate", date, 9);
  write("lastContractor", BID_COMPANY.name, 8);
  write("permitNo", "X", 11);
  write("bridgeNo", "X", 11);
  const box = bid.fields.description;
  if (box && pages[box.page]) {
    // On a white panel over the top of the table, so the grid lines don't run through the words.
    const width = (box.width || 500) - 10;
    // Up to 12 lines; a long description is shortened with "…" but always ends with the debris line.
    const ending = "REMOVE ALL WORK RELATED DEBRIS.";
    let lines = wrap(bidDescription(bid.description), font, 8, width - 14);
    if (lines.length > 12) {
      const body = wrap(bidDescription(bid.description).replace(ending, "").trim(), font, 8, width - 14).slice(0, 11);
      body[10] = `${body[10].replace(/\s+\S*$/, "")} …`;
      lines = [...body, ending];
    }
    const height = lines.length * 10 + 8;
    if (!box.rotate) pages[box.page].drawRectangle({ x: box.x - 4, y: box.y - height + 10, width, height, color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0.55), borderWidth: 0.6 });
    lines.forEach((line, i) => pages[box.page].drawText(line, { x: box.x, y: box.y - i * 10, size: 8, font, color: rgb(0, 0, 0.55), rotate: degrees(box.rotate || 0) }));
  }
  return doc.save();
}
