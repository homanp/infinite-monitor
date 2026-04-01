import { generateText } from "ai";
import { createModel } from "@/lib/create-model";
import { DEFAULT_MODEL } from "@/lib/model-registry";
import { resolveOpenRouterApiKey } from "@/lib/openrouter";

export async function POST(request: Request) {
  const { message, model, apiKey } = (await request.json()) as {
    message: string;
    model?: string;
    apiKey?: string;
  };

  if (!message?.trim()) {
    return Response.json({ title: null }, { status: 400 });
  }

  try {
    const selectedModel = model ?? DEFAULT_MODEL;
    const resolvedApiKey = resolveOpenRouterApiKey(selectedModel, apiKey, request, {
      route: "generate-title",
    });

    const { text } = await generateText({
      model: createModel(selectedModel, resolvedApiKey),
      prompt: `Generate a short widget title (2-4 words max, no punctuation) for this request: "${message}". Reply with only the title, nothing else.`,
    });

    return Response.json({ title: text.trim() });
  } catch {
    return Response.json({ title: null });
  }
}
