import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  const body = await req.json();
  const { omo, status } = body;

  const filePath = path.join(process.cwd(), "data", "status_overrides_2026.csv");

  let rows: string[] = [];
  if (fs.existsSync(filePath)) {
    rows = fs.readFileSync(filePath, "utf8").split("\n");
  }

  let found = false;

  rows = rows.map((line) => {
    if (line.startsWith(omo + "|")) {
      found = true;
      return `${omo}|UPDATED||,${status}`;
    }
    return line;
  });

  if (!found) {
    rows.push(`${omo}|UPDATED||,${status}`);
  }

  fs.writeFileSync(filePath, rows.join("\n"));

  return Response.json({ success: true });
}
