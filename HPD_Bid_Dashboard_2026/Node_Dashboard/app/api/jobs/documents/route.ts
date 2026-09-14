import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { appendStatusHistory } from "../../../../lib/job-field-events";
import { upsertOverride } from "../../../../lib/job-overrides";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GenerateAction = "job_card" | "invoice" | "affidavit" | "bundle";

type GenerateResult = {
  ok?: boolean;
  job_card_path?: string;
  invoice_path?: string;
  affidavit_path?: string;
  affidavit_type?: string;
  affidavit_template_version?: string;
  saved_folder?: string;
  saved_at?: string;
  affidavit_preview_paths?: string[];
  affidavit_preview_urls?: string[];
  affidavit_preview_error?: string;
  error?: string;
};

const DOCUMENT_KEYS = ["job_card_path", "invoice_path", "affidavit_path"] as const;
type DocumentPathKey = (typeof DOCUMENT_KEYS)[number];
const SAVED_DOCUMENTS_ROOT = path.resolve(process.cwd(), "Generated_Documents");

function safeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function safeAction(value: unknown): GenerateAction {
  const text = safeString(value);
  return ["job_card", "invoice", "affidavit", "bundle"].includes(text) ? text as GenerateAction : "bundle";
}

function fileUrl(filePath = "") {
  return filePath ? `/api/jobs/file?path=${encodeURIComponent(filePath)}` : "";
}

function safePathSegment(value: string) {
  return safeString(value).replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "UNKNOWN";
}

function localTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function runGenerator(input: {
  id: string;
  action: GenerateAction;
  affidavitType: string;
  status: string;
  statusDate: string;
}) {
  return new Promise<GenerateResult>((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), "generate_documents_bridge.py");
    const args = [
      scriptPath,
      "--omo",
      input.id,
      "--action",
      input.action,
      "--affidavit-type",
      input.affidavitType,
    ];

    if (input.status) {
      args.push("--status", input.status);
    }
    if (input.statusDate) {
      args.push("--status-date", input.statusDate);
    }

    const child = spawn(process.env.PYTHON_EXE || process.env.PYTHON || "python", args, {
      cwd: process.cwd(),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || "Document generation failed."));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as GenerateResult);
      } catch {
        reject(new Error(stderr || stdout || "Failed to parse document generation response."));
      }
    });
  });
}

function saveGeneratedPackage(id: string, generated: GenerateResult) {
  const savedAt = new Date();
  const savedFolder = path.join(SAVED_DOCUMENTS_ROOT, safePathSegment(id), localTimestamp(savedAt));
  const saved = { ...generated };

  fs.mkdirSync(savedFolder, { recursive: true });
  for (const key of DOCUMENT_KEYS) {
    const filePath = saved[key];
    if (!filePath) continue;

    const sourcePath = path.resolve(filePath);
    if (!fs.existsSync(sourcePath)) continue;

    const destinationPath = path.join(savedFolder, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, destinationPath);
    saved[key] = destinationPath;
  }

  return {
    generated: saved,
    savedFolder,
    savedAt: savedAt.toISOString(),
  };
}

function renderAffidavitPreview(affidavitPath: string, savedFolder: string) {
  return new Promise<{ paths: string[]; error?: string }>((resolve) => {
    const pdfPath = path.resolve(affidavitPath || "");
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      resolve({ paths: [], error: "Generated affidavit PDF was not found." });
      return;
    }

    const previewDir = path.join(savedFolder, "Affidavit_Preview");
    const outputPrefix = path.join(previewDir, "affidavit-page");
    fs.mkdirSync(previewDir, { recursive: true });

    const child = spawn(process.env.PDFTOPPM || "pdftoppm", ["-png", "-r", "110", pdfPath, outputPrefix], {
      cwd: process.cwd(),
      windowsHide: true,
    });
    let stderr = "";
    let finished = false;

    const finish = (result: { paths: string[]; error?: string }) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ paths: [], error: "Affidavit preview took too long. Open the PDF to review it." });
    }, 12000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      finish({ paths: [], error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        finish({ paths: [], error: stderr || "Affidavit preview rendering failed." });
        return;
      }

      const prefixName = path.basename(outputPrefix);
      const paths = fs.readdirSync(previewDir)
        .filter((file) => file.startsWith(`${prefixName}-`) && file.toLowerCase().endsWith(".png"))
        .sort((a, b) => {
          const left = Number(a.match(/-(\d+)\.png$/i)?.[1] || 0);
          const right = Number(b.match(/-(\d+)\.png$/i)?.[1] || 0);
          return left - right;
        })
        .map((file) => path.join(previewDir, file));

      finish({ paths });
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = safeString(body.id || body.omo);
    const status = safeString(body.status);
    const action = safeAction(body.action);
    const affidavitType = safeString(body.affidavitType) || "Work Completed";
    const closeout = Boolean(body.closeout);
    const statusDate = safeString(body.statusDate) || localDateKey();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing job id." }, { status: 400 });
    }

    const generatedResult = await runGenerator({ id, action, affidavitType, status, statusDate });
    const savedPackage = saveGeneratedPackage(id, generatedResult);
    const generated = savedPackage.generated;
    const preview = generated.affidavit_path
      ? await renderAffidavitPreview(generated.affidavit_path, savedPackage.savedFolder)
      : { paths: [] as string[] };
    let override = null;

    if (closeout && status) {
      override = upsertOverride({ id, status, archived: true, statusDate });
      appendStatusHistory(id, status);
    }

    return NextResponse.json({
      ...generated,
      ok: true,
      closeout,
      archived: Boolean(closeout && status),
      override,
      saved_folder: savedPackage.savedFolder,
      saved_at: savedPackage.savedAt,
      affidavit_preview_paths: preview.paths,
      affidavit_preview_urls: preview.paths.map(fileUrl),
      affidavit_preview_error: preview.error,
      file_urls: {
        job_card_path: fileUrl(generated.job_card_path),
        invoice_path: fileUrl(generated.invoice_path),
        affidavit_path: fileUrl(generated.affidavit_path),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to generate documents." },
      { status: 500 },
    );
  }
}
