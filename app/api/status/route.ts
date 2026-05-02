import fs from "fs";
import path from "path";

export async function POST(req: Request): Promise<Response> {
  const { omo, status } = await req.json();

  const file = path.join(process.cwd(), "data", "status_overrides_2026.csv");

  let rows: string[] = [];

  if (fs.existsSync(file)) {
    rows = fs.readFileSync(file, "utf8").split("\n");
  }

  let updated = false;

  rows = rows.map((line) => {
    if (line.startsWith(omo + "|")) {
      updated = true;
      return `${omo}|UPDATED||,${status}`;
    }
    return line;
  });

  if (!updated) {
    rows.push(`${omo}|UPDATED||,${status}`);
  }

  fs.writeFileSync(file, rows.join("\n"));

  return Response.json({ ok: true });
}
