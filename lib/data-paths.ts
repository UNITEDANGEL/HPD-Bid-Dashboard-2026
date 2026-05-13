import fs from "fs";
import path from "path";

export function getDataDir() {
  return process.env.HPD_DATA_DIR || path.join(process.cwd(), "data");
}

export function bundledDataDir() {
  return path.join(process.cwd(), "data");
}

export function dataPath(fileName: string) {
  return path.join(getDataDir(), fileName);
}

export function bundledDataPath(fileName: string) {
  return path.join(bundledDataDir(), fileName);
}

export function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

export function seedDataFileIfMissing(fileName: string) {
  ensureDataDir();

  const livePath = dataPath(fileName);
  const bundledPath = bundledDataPath(fileName);

  if (!fs.existsSync(livePath) && fs.existsSync(bundledPath)) {
    fs.copyFileSync(bundledPath, livePath);
  }

  return livePath;
}
