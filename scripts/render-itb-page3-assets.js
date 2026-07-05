const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const projectRoot = path.resolve(root, "..", "..");
const dataFile = path.join(root, "public", "data", "COA_Fetcher_2026.json");
const outputDir = path.join(root, "public", "documents", "itb-pages");
const publicPdfDir = path.join(root, "public", "documents", "itb");
const manifestFile = path.join(root, "public", "data", "itb_source_manifest.json");
const missingFile = path.join(root, "public", "data", "itb_source_missing.json");
const page = Number(process.env.HPD_ITB_SOURCE_PAGE || 3) || 3;
const dpi = Number(process.env.HPD_ITB_SOURCE_DPI || 150) || 150;
const force = process.argv.includes("--force");
const copyPdfs = process.argv.includes("--copy-pdfs") || process.env.HPD_COPY_ITB_PDFS === "1";

const faxDescriptionPageOverrides = new Map([
  // This fax bundle's OMO work description is on the COA-style page before a blank fax page.
  ["faxcopy_20260324_123735_.69c2bf4dc9546.pdf", 3],
  // This multi-fax bundle has extra fax cover pages before the ITB packet.
  ["faxcopy_20260106_104555_.695d315782d68.pdf", 6],
]);

function fileExists(target) {
  try {
    return fs.existsSync(target) && fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function directoryExists(target) {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function cleanDocumentFileName(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const fileName = value.split(/[\\/]/).pop().trim();
  if (!/\.pdf$/i.test(fileName)) return "";
  return fileName;
}

function documentStem(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function safeAssetStem(fileName) {
  return (
    documentStem(fileName)
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "itb-page"
  );
}

function isFaxCopyFileName(fileName) {
  return /^faxcopy_/i.test(String(fileName || ""));
}

function descriptionRenderPage(ref, source) {
  const fileName = String(ref?.fileName || "");
  const lowerFileName = fileName.toLowerCase();
  const pageCount = Number(source?.pageCount || 0);
  const overridePage = faxDescriptionPageOverrides.get(lowerFileName);
  if (overridePage && pageCount >= overridePage) return overridePage;

  if (isFaxCopyFileName(fileName) && pageCount >= page + 1) {
    return page + 1;
  }

  return page;
}

function urlForPublicFile(relativeParts) {
  return `/${relativeParts.map((part) => encodeURIComponent(part)).join("/")}`;
}

function walkPdfFiles(dir, bucket = []) {
  if (!directoryExists(dir)) return bucket;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPdfFiles(fullPath, bucket);
    } else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
      bucket.push(fullPath);
    }
  }
  return bucket;
}

function popplerCandidatePaths(toolName) {
  const userProfile = process.env.USERPROFILE || "";
  const executable = process.platform === "win32" ? `${toolName}.exe` : toolName;
  const command = process.platform === "win32" ? `${toolName}.cmd` : toolName;
  return [
    toolName === "pdftoppm" ? process.env.PDFTOPPM_BIN : process.env.PDFINFO_BIN,
    path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "Library", "bin", executable),
    path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "bin", command),
    toolName,
  ].filter(Boolean);
}

function resolvePopplerTool(toolName) {
  for (const candidate of popplerCandidatePaths(toolName)) {
    if (candidate === toolName || fileExists(candidate)) return candidate;
  }
  throw new Error(`Cannot find ${toolName}. Set ${toolName === "pdftoppm" ? "PDFTOPPM_BIN" : "PDFINFO_BIN"} to the Poppler executable.`);
}

function readPdfPageCount(pdfinfo, inputPdf) {
  const result = spawnSync(pdfinfo, [inputPdf], { cwd: root, encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) return 0;
  const match = String(result.stdout || "").match(/^Pages:\s+(\d+)/im);
  return match ? Number(match[1]) || 0 : 0;
}

function runPdftoppm(pdftoppm, inputPdf, outputPrefix, renderPage) {
  const result = spawnSync(
    pdftoppm,
    ["-f", String(renderPage), "-l", String(renderPage), "-png", "-r", String(dpi), inputPdf, outputPrefix],
    { cwd: root, encoding: "utf8", shell: false }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `pdftoppm exited ${result.status}`).trim());
  }
}

function removeGeneratedPrefixFiles(prefixBase) {
  for (const name of fs.readdirSync(outputDir)) {
    if (name.startsWith(`${prefixBase}-`) && /\.png$/i.test(name)) {
      fs.rmSync(path.join(outputDir, name), { force: true });
    }
  }
}

function findGeneratedPrefixFile(prefixBase) {
  const matches = fs
    .readdirSync(outputDir)
    .filter((name) => name.startsWith(`${prefixBase}-`) && /\.png$/i.test(name))
    .sort();
  return matches[0] ? path.join(outputDir, matches[0]) : "";
}

function renderSinglePage(pdftoppm, inputPdf, assetStem, renderPage) {
  const outputPrefixBase = `${assetStem}-p${renderPage}`;
  const outputPrefix = path.join(outputDir, outputPrefixBase);
  removeGeneratedPrefixFiles(outputPrefixBase);
  runPdftoppm(pdftoppm, inputPdf, outputPrefix, renderPage);
  const generatedFile = findGeneratedPrefixFile(outputPrefixBase);
  if (!generatedFile) throw new Error(`Expected rendered page output was not created for ${outputPrefixBase}`);
  return generatedFile;
}

function uniqueExistingDirectories(paths) {
  const seen = new Set();
  const out = [];
  for (const candidate of paths.filter(Boolean)) {
    const resolved = path.resolve(candidate);
    const key = resolved.toLowerCase();
    if (seen.has(key) || !directoryExists(resolved)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

const sourceDirs = uniqueExistingDirectories([
  process.env.HPD_ITB_PDF_DIR,
  path.join(projectRoot, "Scripts", "Diagnostics script", "ITB_Downloads_V5"),
  path.join(projectRoot, "Scripts", "Diagnostics script", "ITB_Downloads_V6"),
  path.join(projectRoot, "Invitations_to_Bid"),
  path.join(projectRoot, "..", "temp script", "UNITED ANGEL CONSTRUCTION BIDS 2024 ONE DRIVE 1"),
]);

if (!sourceDirs.length) {
  throw new Error("No source PDF directories found. Set HPD_ITB_PDF_DIR to the folder containing ITB PDFs.");
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(publicPdfDir, { recursive: true });
fs.mkdirSync(path.dirname(manifestFile), { recursive: true });

const jobs = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const refs = new Map();
for (const job of jobs) {
  const fileName = cleanDocumentFileName(job.ITBFile || job.itbFile || job["ITB File"]);
  if (!fileName) continue;
  const omo = String(job.OMO || job.omo || job.JobID || "").trim();
  if (!refs.has(fileName)) refs.set(fileName, { fileName, omo });
}

const sourceFiles = [];
sourceDirs.forEach((dir, dirIndex) => {
  for (const filePath of walkPdfFiles(dir)) {
    sourceFiles.push({
      filePath,
      dirIndex,
      baseName: path.basename(filePath),
      baseLower: path.basename(filePath).toLowerCase(),
    });
  }
});

const exactFiles = new Map();
for (const source of sourceFiles) {
  const existing = exactFiles.get(source.baseLower);
  if (!existing || source.dirIndex < existing.dirIndex) exactFiles.set(source.baseLower, source);
}

const pdfinfo = resolvePopplerTool("pdfinfo");
const pdftoppm = resolvePopplerTool("pdftoppm");
const pageCountCache = new Map();

function cachedPdfPageCount(inputPdf) {
  if (!pageCountCache.has(inputPdf)) {
    pageCountCache.set(inputPdf, readPdfPageCount(pdfinfo, inputPdf));
  }
  return pageCountCache.get(inputPdf) || 0;
}

function withPageCount(source) {
  if (!source) return null;
  return {
    ...source,
    pageCount: cachedPdfPageCount(source.filePath),
  };
}

function findUsableSource(ref) {
  const rejected = [];
  const exact = withPageCount(exactFiles.get(ref.fileName.toLowerCase()));

  if (exact) {
    if (exact.pageCount >= page) return { source: { ...exact, sourceMatch: "exact" }, rejected };
    rejected.push({
      filePath: exact.filePath,
      pageCount: exact.pageCount,
      reason: `source has fewer than ${page} pages`,
    });
  }

  const omo = ref.omo || (ref.fileName.match(/[A-Z]{2}\d{5}/i) || [""])[0].toUpperCase();
  const candidates = sourceFiles
    .filter((source) => omo && source.baseName.toUpperCase().includes(omo))
    .sort((a, b) => a.dirIndex - b.dirIndex || a.baseName.localeCompare(b.baseName));

  for (const candidate of candidates) {
    if (exact && candidate.filePath === exact.filePath) continue;
    const candidateWithPages = withPageCount(candidate);
    if (!candidateWithPages) continue;
    if (candidateWithPages.pageCount >= page) {
      return {
        source: {
          ...candidateWithPages,
          sourceMatch: exact ? "omo-after-short-exact" : "omo",
        },
        rejected,
      };
    }
    rejected.push({
      filePath: candidateWithPages.filePath,
      pageCount: candidateWithPages.pageCount,
      reason: `source has fewer than ${page} pages`,
    });
  }

  return { source: null, rejected };
}

const manifest = {
  generatedAt: new Date().toISOString(),
  page,
  dpi,
  totalJobs: Array.isArray(jobs) ? jobs.length : 0,
  uniqueItbRefs: refs.size,
  sourceDirectories: sourceDirs,
  entries: {},
  summary: {
    rendered: 0,
    reused: 0,
    copiedPdfs: 0,
    missingSource: 0,
    failed: 0,
  },
};
const missing = [];
const failed = [];
const referencedPageFiles = new Set();

for (const ref of refs.values()) {
  const { source, rejected } = findUsableSource(ref);

  const assetStem = safeAssetStem(ref.fileName);

  if (!source) {
    manifest.summary.missingSource += 1;
    missing.push({
      ...ref,
      reason: `No confirmed ITB source PDF with page ${page} was found.`,
      rejected,
    });
    continue;
  }

  try {
    const renderPage = descriptionRenderPage(ref, source);
    const pageFileName = `${assetStem}-p${renderPage}.png`;
    const pageFilePath = path.join(outputDir, pageFileName);

    if (force || !fileExists(pageFilePath)) {
      const generatedFile = renderSinglePage(pdftoppm, source.filePath, assetStem, renderPage);
      const finalPageFileName = `${assetStem}-p${renderPage}.png`;
      const finalPageFilePath = path.join(outputDir, finalPageFileName);
      fs.rmSync(finalPageFilePath, { force: true });
      fs.renameSync(generatedFile, finalPageFilePath);
      manifest.summary.rendered += 1;
    } else {
      manifest.summary.reused += 1;
    }

    const finalPageFileName = `${assetStem}-p${renderPage}.png`;
    const finalPageFilePath = path.join(outputDir, finalPageFileName);

    let pdfUrl = "";
    const publicPdfPath = path.join(publicPdfDir, ref.fileName);
    if (copyPdfs && source && !fileExists(publicPdfPath)) {
      fs.copyFileSync(source.filePath, publicPdfPath);
      manifest.summary.copiedPdfs += 1;
    }
    if (fileExists(publicPdfPath)) {
      pdfUrl = urlForPublicFile(["documents", "itb", ref.fileName]);
    }

    const entry = {
      page: renderPage,
      pageImage: urlForPublicFile(["documents", "itb-pages", finalPageFileName]),
      sourceFile: source ? source.filePath : "",
      sourceMatch: source ? source.sourceMatch : "existing-image",
    };
    if (pdfUrl) entry.pdf = pdfUrl;

    referencedPageFiles.add(finalPageFileName);
    manifest.entries[ref.fileName] = entry;
  } catch (error) {
    manifest.summary.failed += 1;
    failed.push({
      fileName: ref.fileName,
      omo: ref.omo,
      sourceFile: source ? source.filePath : "",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

if (!process.argv.includes("--no-clean")) {
  for (const entry of fs.readdirSync(outputDir)) {
    if (/\.png$/i.test(entry) && !referencedPageFiles.has(entry)) {
      fs.rmSync(path.join(outputDir, entry), { force: true });
    }
  }
}

fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(missingFile, `${JSON.stringify({ generatedAt: manifest.generatedAt, missing, failed }, null, 2)}\n`, "utf8");

console.log(JSON.stringify(manifest.summary, null, 2));
console.log(`ITB page manifest written to ${manifestFile}`);
if (missing.length) console.log(`${missing.length} ITB refs have no source PDF yet.`);
if (failed.length) console.log(`${failed.length} ITB refs failed rendering.`);
