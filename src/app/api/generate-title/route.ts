import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export async function POST(request: Request) {
  const { message } = (await request.json()) as { message: string };

  if (!message?.trim()) {
    return Response.json({ title: null }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      prompt: `Generate a short widget title (2-4 words max, no punctuation) for this request: "${message}". Reply with only the title, nothing else.`,
      maxOutputTokens: 20,
    });

    return Response.json({ title: text.trim() });
  } catch {
    return Response.json({ title: null });
  }
}
