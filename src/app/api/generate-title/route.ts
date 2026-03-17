import { generateText } from "ai";
import { createModel } from "@/lib/create-model";

export async function POST(request: Request) {
  const { message, model, apiKey, planEndpoint } = (await request.json()) as {
    message: string;
    model?: string;
    apiKey?: string;
    planEndpoint?: string;
  };

  if (!message?.trim()) {
    return Response.json({ title: null }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: createModel(model ?? "anthropic:claude-haiku-4-5", { apiKey, planEndpoint }),
      prompt: `Generate a short widget title (2-4 words max, no punctuation) for this request: "${message}". Reply with only the title, nothing else.`,
    });

    return Response.json({ title: text.trim() });
  } catch {
    return Response.json({ title: null });
  }
}
