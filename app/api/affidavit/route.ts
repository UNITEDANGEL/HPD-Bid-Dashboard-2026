import { exec } from "child_process";
import path from "path";
import fs from "fs";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const { type, job } = body;

  const script =
    type === "completed"
      ? "fill_work_completed_affidavit_working.py"
      : "fill_no_work_affidavit_working.py";

  const scriptPath = path.join(process.cwd(), "worker", "affidavits", script);

  const outDir = path.join(process.cwd(), "public", "affidavits");
  fs.mkdirSync(outDir, { recursive: true });

  const safeOmo = String(job?.OMO || job?.omo || job?.id || "job").replace(/[^a-z0-9_-]/gi, "_");
  const fileName = `${safeOmo}_${Date.now()}.pdf`;
  const outputPath = path.join(outDir, fileName);

  const command = `python "${scriptPath}"`;

  return new Promise<Response>((resolve) => {
    exec(command, (err) => {
      if (err) {
        resolve(Response.json({ ok: false, error: String(err) }, { status: 500 }));
        return;
      }

      resolve(Response.json({
        ok: true,
        url: `/affidavits/${fileName}`,
        outputPath,
      }));
    });
  });
}
