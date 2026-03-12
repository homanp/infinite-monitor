import type { Widget } from "@/store/widget-store";

/** Fire-and-forget sync of a widget to the SQLite database via API */
export function syncWidgetToDb(widget: Widget) {
  fetch("/api/widgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: widget.id,
      title: widget.title,
      description: widget.description,
      code: widget.code,
      layout: widget.layout,
      messages: widget.messages,
    }),
  }).catch(() => {});
}

/** Delete a widget from the database */
export function deleteWidgetFromDb(widgetId: string) {
  fetch("/api/widgets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: widgetId }),
  }).catch(() => {});
}
