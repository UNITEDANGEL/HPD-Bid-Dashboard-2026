// Makes the TEST-0001 sample documents (clearly marked SAMPLE / NOT A REAL WORK ORDER):
// a 3-page ITB with the scope on page 3 (like HPD's), and a COA. Run once; the PDFs are committed.
import fs from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function make(file, pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const lines of pages) {
    const page = pdf.addPage([612, 792]);
    page.drawText("SAMPLE - TEST JOB - NOT A REAL WORK ORDER", { x: 120, y: 400, size: 26, font: bold, color: rgb(0.85, 0.85, 0.92), rotate: { type: "degrees", angle: 35 } });
    let y = 740;
    for (const [text, isBold] of lines) {
      page.drawText(text, { x: 50, y, size: isBold ? 13 : 11, font: isBold ? bold : font });
      y -= isBold ? 22 : 17;
    }
  }
  fs.writeFileSync(file, await pdf.save());
}

const head = [["NYC HPD EMERGENCY OPERATIONS DIVISION - SAMPLE", true], ["INVITATION TO BID (ITB) - TEST JOB TEST-0001", true], ["", false]];
await make("public/documents/itb/TEST-0001_SAMPLE-ITB.pdf", [
  [...head, ["OMO / Work #: TEST-0001", false], ["Address: TEST JOB - 100 GOLD STREET, 10038 (Manhattan)", false], ["Location: Public Area (Exterior)", false], ["Tenant: Sample Tenant  212-555-0100", false]],
  [...head, ["Bid instructions (sample text).", false], ["This document exists only to test the field app.", false]],
  [...head, ["SCOPE OF WORK (page 3)", true],
    ["REPAIR BUILDING ENTRANCE DOOR", false],
    ["MAKE ALL NECESSARY REPAIR TO THE DOOR TO RE-ALIGN WITH FRAME.", false],
    ["ENSURE THE DOOR IS SELF CLOSING AND LATCHING PROPERLY.", false],
    ["TOTAL DOORS = 1 (ONE)", false],
    ["REMOVE ALL WORK-RELATED DEBRIS.", false]],
]);
await make("public/documents/itb/TEST-0001_SAMPLE-COA.pdf", [
  [["NYC HPD - CERTIFICATE OF AWARD (COA) - SAMPLE", true], ["", false], ["OMO / Work #: TEST-0001", false], ["Award amount: $100.00", false], ["Awarded by: TEST", false], ["Address: TEST JOB - 100 GOLD STREET, 10038", false]],
]);
console.log("Made the TEST-0001 sample ITB and COA.");
