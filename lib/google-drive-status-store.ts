import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { dataPath, ensureDataDir } from "./data-paths";

const STATUS_FILE = "status_overrides_2026.csv";
const DEFAULT_DRIVE_FOLDER_PATH = "HPD_Bid_Management_Project/HPD_Bid_Dashboard_2026/Node_Dashboard/data";

function readJsonFromEnvOrFile(envName: string, fileName: string) {
  const rawEnv = process.env[envName];

  if (rawEnv && rawEnv.trim()) {
    const value = rawEnv.trim();

    try {
      return JSON.parse(value);
    } catch {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      return JSON.parse(decoded);
    }
  }

  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function driveEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getDriveClient() {
  const credentials = readJsonFromEnvOrFile("GOOGLE_CREDENTIALS_JSON", "credentials.json");
  const token = readJsonFromEnvOrFile("GOOGLE_TOKEN_JSON", "token.json");

  if (!credentials || !token) {
    return null;
  }

  const clientConfig = credentials.installed || credentials.web || credentials;
  const clientId = clientConfig.client_id;
  const clientSecret = clientConfig.client_secret;
  const redirectUri = clientConfig.redirect_uris?.[0] || "http://localhost";

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials(token);

  return google.drive({ version: "v3", auth });
}

async function findChildFolder(drive: any, parentId: string, name: string) {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `name='${driveEscape(name)}'`,
    `'${parentId}' in parents`,
  ].join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
  });

  return res.data.files?.[0] || null;
}

async function createChildFolder(drive: any, parentId: string, name: string) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name",
  });

  return res.data;
}

async function findOrCreateFolderPath(drive: any, folderPath: string) {
  const parts = folderPath.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  let parentId = "root";

  for (const part of parts) {
    const existing = await findChildFolder(drive, parentId, part);
    const folder = existing || await createChildFolder(drive, parentId, part);
    parentId = folder.id;
  }

  return parentId;
}

async function findFileInFolder(drive: any, folderId: string, fileName: string) {
  const q = [
    "trashed=false",
    `name='${driveEscape(fileName)}'`,
    `'${folderId}' in parents`,
  ].join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id,name,modifiedTime,size)",
    spaces: "drive",
    pageSize: 1,
  });

  return res.data.files?.[0] || null;
}

export async function uploadStatusOverridesToDrive() {
  try {
    const drive = await getDriveClient();

    if (!drive) {
      return { ok: false, skipped: true, reason: "Missing Google credentials/token." };
    }

    const localPath = dataPath(STATUS_FILE);

    if (!fs.existsSync(localPath)) {
      return { ok: false, skipped: true, reason: `${STATUS_FILE} does not exist locally.` };
    }

    const folderPath = process.env.HPD_DRIVE_STATUS_FOLDER_PATH || DEFAULT_DRIVE_FOLDER_PATH;
    const folderId = await findOrCreateFolderPath(drive, folderPath);
    const existing = await findFileInFolder(drive, folderId, STATUS_FILE);

    const media = {
      mimeType: "text/csv",
      body: fs.createReadStream(localPath),
    };

    if (existing?.id) {
      const updated = await drive.files.update({
        fileId: existing.id,
        media,
        fields: "id,name,modifiedTime,size",
      });

      return {
        ok: true,
        action: "updated",
        folderPath,
        file: updated.data,
      };
    }

    const created = await drive.files.create({
      requestBody: {
        name: STATUS_FILE,
        parents: [folderId],
        mimeType: "text/csv",
      },
      media,
      fields: "id,name,modifiedTime,size",
    });

    return {
      ok: true,
      action: "created",
      folderPath,
      file: created.data,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Google Drive upload failed." };
  }
}

export async function downloadStatusOverridesFromDriveIfAvailable() {
  try {
    const drive = await getDriveClient();

    if (!drive) {
      return { ok: false, skipped: true, reason: "Missing Google credentials/token." };
    }

    const folderPath = process.env.HPD_DRIVE_STATUS_FOLDER_PATH || DEFAULT_DRIVE_FOLDER_PATH;
    const folderId = await findOrCreateFolderPath(drive, folderPath);
    const existing = await findFileInFolder(drive, folderId, STATUS_FILE);

    if (!existing?.id) {
      return { ok: false, skipped: true, reason: `${STATUS_FILE} not found in Drive.`, folderPath };
    }

    const res = await drive.files.get(
      { fileId: existing.id, alt: "media" },
      { responseType: "arraybuffer" }
    );

    ensureDataDir();
    const localPath = dataPath(STATUS_FILE);
    fs.writeFileSync(localPath, Buffer.from(res.data as ArrayBuffer));

    return {
      ok: true,
      action: "downloaded",
      folderPath,
      file: existing,
      localPath,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Google Drive download failed." };
  }
}
