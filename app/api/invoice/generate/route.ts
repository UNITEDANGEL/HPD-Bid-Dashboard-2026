import { spawn } from "child_process";
import path from "path";
export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const scriptPath = path.join(process.cwd(), "worker", "invoices", "run_invoice.py");
  return new Promise<Response>((resolve) => {
    const child = spawn("python", [scriptPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(
          Response.json(
            {
              ok: false,
              error: stderr || stdout || `Invoice worker exited with code ${code}`,
            },
            { status: 500 }
          )
        );
        return;
      }
      try {
        const lines = stdout.trim().split(/\r?\n/);
        const lastLine = lines[lines.length - 1];
        const result = JSON.parse(lastLine);
        resolve(Response.json(result));
      } catch {
        resolve(
          Response.json(
            {
              ok: false,
              error: "Invoice worker returned invalid JSON",
              stdout,
              stderr,
            },
            { status: 500 }
          )
        );
      }
    });
    child.stdin.write(JSON.stringify(body));
    child.stdin.end();
  });
}
