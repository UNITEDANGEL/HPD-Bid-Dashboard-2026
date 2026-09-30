import { handleDriveAuth } from "../../../../server/drive-auth.mjs";

// Cloudflare provides the private session binding in production. Local preview
// stays disconnected; never fall back to Gmail credentials or a public endpoint.
export async function GET(request: Request) { return handleDriveAuth(request, {}); }
export async function POST(request: Request) { return handleDriveAuth(request, {}); }
