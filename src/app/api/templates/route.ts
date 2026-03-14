import { getDashboard, getWidget, getWidgetFiles } from "@/db/widgets";
import { TEMPLATES } from "@/lib/template-config";

export async function GET() {
  const templates = TEMPLATES.map((config) => {
    const dashboard = getDashboard(config.dashboardId);
    if (!dashboard) return null;

    const widgetIds: string[] = dashboard.widgetIdsJson
      ? JSON.parse(dashboard.widgetIdsJson)
      : [];

    const widgets = widgetIds
      .map((id) => {
        const w = getWidget(id);
        if (!w || !w.code) return null;
        const files = getWidgetFiles(id);
        return {
          title: w.title,
          description: w.description,
          code: w.code,
          files,
          layoutJson: w.layoutJson,
        };
      })
      .filter(Boolean);

    if (widgets.length === 0) return null;

    return {
      name: config.name,
      description: config.description,
      icon: config.icon,
      screenshot: config.screenshot,
      widgetCount: widgets.length,
      preview: widgets.map((w) => (w as { title: string }).title),
      widgets,
    };
  }).filter(Boolean);

  return Response.json(templates);
}
