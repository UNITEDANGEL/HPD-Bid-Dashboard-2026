import { handlePrivate } from "../../../server/private-data.mjs";

export function onRequest(context) {
  return handlePrivate(context.request, context.env);
}
