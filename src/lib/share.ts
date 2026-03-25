import { createHmac } from "node:crypto";

export const SHARE_BUCKET = "im-share";

function getShareSecret(explicit?: string) {
  const secret = explicit ?? process.env.SHARE_ID_SECRET;
  if (!secret) throw new Error("SHARE_ID_SECRET is not set");
  return secret;
}

export function deriveShareId(dashboardId: string, explicitSecret?: string) {
  const digest = createHmac("sha256", getShareSecret(explicitSecret))
    .update(dashboardId)
    .digest("base64url");
  return `shr_${digest.slice(0, 22)}`;
}

export function getSessionStreamId(shareId: string) {
  return `${shareId}.session`;
}

export function getPublishedWidgetId(shareId: string, sourceWidgetId: string) {
  return `share--${shareId}--${sourceWidgetId}`;
}

export function isPublishedWidgetId(widgetId: string) {
  return widgetId.startsWith("share--");
}
