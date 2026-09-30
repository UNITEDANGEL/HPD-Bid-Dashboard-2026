import { handleDriveAuth } from "../../../server/drive-auth.mjs";

export function onRequest(context) {
  return handleDriveAuth(context.request, context.env);
}
