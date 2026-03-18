import { upsertWidget } from "@/db/widgets";
import {
  writeWidgetFile,
  addWidgetDependencies,
  rebuildWidget,
} from "@/lib/widget-builder";

export async function POST(request: Request) {
  const { widgets } = (await request.json()) as {
    widgets: Array<{
      id: string;
      title: string;
      description: string;
      code: string;
      files: Record<string, string>;
    }>;
  };

  for (const w of widgets) {
    upsertWidget({
      id: w.id,
      title: w.title,
      description: w.description,
      code: w.code,
      filesJson: JSON.stringify(w.files),
    });

    for (const [path, content] of Object.entries(w.files)) {
      if (path === "deps.json") {
        try {
          const packages: string[] = JSON.parse(content);
          await addWidgetDependencies(w.id, packages);
        } catch {}
        continue;
      }
      try {
        await writeWidgetFile(w.id, path, content);
      } catch {}
    }

    rebuildWidget(w.id).catch(console.error);
  }

  return Response.json({ ok: true, count: widgets.length });
}
