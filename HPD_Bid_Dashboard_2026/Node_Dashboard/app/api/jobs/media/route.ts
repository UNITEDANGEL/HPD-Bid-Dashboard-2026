import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function cleanId(id: string) {
  return String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function uploadDir(id: string) {
  return path.resolve(process.cwd(), "public", "job-uploads", cleanId(id));
}

function publicUrl(id: string, fileName: string) {
  return `/job-uploads/${cleanId(id)}/${fileName}`;
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function mediaType(name: string) {
  if (/\.(avif|gif|jpe?g|png|webp)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "file";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = cleanId(url.searchParams.get("jobId") || url.searchParams.get("id") || "");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const dir = uploadDir(id);
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ ok: true, files: [] });
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .map((name) => {
      const target = path.join(dir, name);
      const stats = fs.statSync(target);
      return {
        id: name,
        name,
        type: mediaType(name),
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        url: publicUrl(id, name),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ ok: true, files });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const id = cleanId(String(formData.get("jobId") || formData.get("id") || ""));
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const dir = uploadDir(id);
  const publicRoot = path.resolve(process.cwd(), "public", "job-uploads");
  if (!isInside(publicRoot, dir)) {
    return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });
  }

  const uploads = [
    ...formData.getAll("photos"),
    ...formData.getAll("files"),
  ].filter((value): value is File => value instanceof File);

  const saved = [];
  fs.mkdirSync(dir, { recursive: true });

  for (const [index, file] of uploads.entries()) {
    const ext = path.extname(file.name).toLowerCase() || ".bin";
    const base = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "field-file";
    const safeName = `${Date.now()}-${index}-${base}${ext.replace(/[^.a-z0-9]/g, "")}`;
    const target = path.join(dir, safeName);
    if (!isInside(dir, target)) continue;

    const bytes = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(target, bytes);
    saved.push({
      id: safeName,
      name: safeName,
      type: file.type || mediaType(safeName),
      size: bytes.length,
      createdAt: new Date().toISOString(),
      url: publicUrl(id, safeName),
    });
  }

  return NextResponse.json({ ok: true, files: saved });
}
