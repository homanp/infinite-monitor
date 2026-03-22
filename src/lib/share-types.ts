export interface PublishedCanvasLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PublishedTextBlockSnapshotV1 {
  id: string;
  text: string;
  fontSize: number;
  layout: PublishedCanvasLayout;
}

export interface PublishedWidgetSnapshotV1 {
  sourceWidgetId: string;
  publishedWidgetId: string;
  title: string;
  description: string;
  layout: PublishedCanvasLayout;
  files: Record<string, string>;
}

export interface PublishedDashboardSnapshotV1 {
  version: "v1";
  shareId: string;
  dashboardId: string;
  title: string;
  publishedAt: string;
  textBlocks: PublishedTextBlockSnapshotV1[];
  widgets: PublishedWidgetSnapshotV1[];
}

function isCanvasLayout(value: unknown): value is PublishedCanvasLayout {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((key) => typeof candidate[key] === "number");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

export function isPublishedDashboardSnapshotV1(
  value: unknown,
): value is PublishedDashboardSnapshotV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== "v1"
    || typeof candidate.shareId !== "string"
    || typeof candidate.dashboardId !== "string"
    || typeof candidate.title !== "string"
    || typeof candidate.publishedAt !== "string"
    || !Array.isArray(candidate.textBlocks)
    || !Array.isArray(candidate.widgets)
  ) {
    return false;
  }

  const textBlocksValid = candidate.textBlocks.every((textBlock) => {
    if (!textBlock || typeof textBlock !== "object") {
      return false;
    }

    const block = textBlock as Record<string, unknown>;
    return (
      typeof block.id === "string"
      && typeof block.text === "string"
      && typeof block.fontSize === "number"
      && isCanvasLayout(block.layout)
    );
  });

  if (!textBlocksValid) {
    return false;
  }

  return candidate.widgets.every((widget) => {
    if (!widget || typeof widget !== "object") {
      return false;
    }

    const publishedWidget = widget as Record<string, unknown>;
    return (
      typeof publishedWidget.sourceWidgetId === "string"
      && typeof publishedWidget.publishedWidgetId === "string"
      && typeof publishedWidget.title === "string"
      && typeof publishedWidget.description === "string"
      && isCanvasLayout(publishedWidget.layout)
      && isStringRecord(publishedWidget.files)
    );
  });
}
