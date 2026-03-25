import { upsertWidget } from "@/db/widgets";
import {
  writeWidgetFile,
  addWidgetDependencies,
  buildWidget,
} from "@/lib/widget-runner";

export const maxDuration = 800;

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
  }

  // Build widgets sequentially to avoid resource contention on
  // memory-constrained hosts (e.g. Railway).
  for (const w of widgets) {
    try {
      await buildWidget(w.id);
    } catch (err) {
      console.error(`[bootstrap] build failed for ${w.id}:`, err);
    }
  }

  return Response.json({ ok: true, count: widgets.length });
}
