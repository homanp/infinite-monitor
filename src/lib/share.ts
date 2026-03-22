import { createHmac } from "node:crypto";

export const SHARE_BUCKET = "im-share";

function getShareSecret(explicitSecret?: string) {
  const secret = explicitSecret ?? process.env.SHARE_ID_SECRET;
  if (!secret) {
    throw new Error("SHARE_ID_SECRET is not configured");
  }
  return secret;
}

export function deriveShareId(dashboardId: string, explicitSecret?: string) {
  const digest = createHmac("sha256", getShareSecret(explicitSecret))
    .update(dashboardId)
    .digest("base64url");

  return `shr_${digest.slice(0, 22)}`;
}

export function getSnapshotStreamId(shareId: string) {
  return `${shareId}.snapshot`;
}

export function getTraceStreamId(shareId: string) {
  return `${shareId}.trace`;
}

export function getPublishedWidgetId(shareId: string, sourceWidgetId: string) {
  return `share--${shareId}--${sourceWidgetId}`;
}
