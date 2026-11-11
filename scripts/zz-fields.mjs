import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
for (const f of ["work-performed-affidavit.pdf","work-performed-affidavit-2025.pdf","no-work-performed-affidavit.pdf","no-work-performed-affidavit-2025.pdf"]) {
  const d = await PDFDocument.load(fs.readFileSync("public/templates/"+f));
  console.log(f, "::", d.getForm().getFields().map(x=>x.getName()).join(" | "));
}
