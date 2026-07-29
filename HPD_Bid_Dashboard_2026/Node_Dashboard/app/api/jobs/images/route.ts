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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = cleanId(url.searchParams.get("id") || "");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const dir = uploadDir(id);
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ ok: true, files: [] });
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => /\.(avif|gif|jpe?g|png|webp)$/i.test(name))
    .map((name) => ({ name, url: publicUrl(id, name) }));

  return NextResponse.json({ ok: true, files });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const id = cleanId(String(formData.get("id") || ""));
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const dir = uploadDir(id);
  const publicRoot = path.resolve(process.cwd(), "public", "job-uploads");
  if (!isInside(publicRoot, dir)) {
    return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });
  }

  const files = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const saved = [];
  fs.mkdirSync(dir, { recursive: true });

  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith("image/")) continue;
    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    const safeName = `${Date.now()}-${index}${ext.replace(/[^.a-z0-9]/g, "")}`;
    const target = path.join(dir, safeName);
    if (!isInside(dir, target)) continue;

    const bytes = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(target, bytes);
    saved.push({ name: safeName, url: publicUrl(id, safeName) });
  }

  return NextResponse.json({ ok: true, files: saved });
}
