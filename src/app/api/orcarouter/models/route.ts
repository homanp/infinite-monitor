import { resolveOrcaOrigins } from "@/lib/orcarouter/config";
import {
  fetchOrcaCatalog,
  toPublicModels,
  type OrcaCapability,
} from "@/lib/orcarouter/catalog";

export const dynamic = "force-dynamic";

const CAPABILITIES: OrcaCapability[] = ["chat", "embedding", "image", "video", "rerank"];

function readBearerKey(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Server-side model discovery. The user's OrcaRouter key is held by the
 * browser (BYOK) and forwarded per request; it is never persisted here and
 * never appears in a URL.
 */
export async function GET(request: Request) {
  const apiKey = readBearerKey(request);
  if (!apiKey) {
    return Response.json({ error: "orcarouter_credential_required" }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("capability") ?? "chat";
  const capability = CAPABILITIES.find((value) => value === requested);
  if (!capability) {
    return Response.json({ error: "unsupported_capability" }, { status: 400 });
  }

  const { apiBase } = resolveOrcaOrigins();

  try {
    const models = await fetchOrcaCatalog({ apiBase, apiKey, capability });
    return Response.json(
      {
        source: "live",
        catalogUrl: `${apiBase}/models?capability=${capability}`,
        models: toPublicModels(models),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    return Response.json(
      {
        error: "orcarouter_catalog_unavailable",
        message: "Live OrcaRouter model discovery failed. The verified fallback catalog is in use.",
      },
      { status: status === 401 ? 401 : 502 }
    );
  }
}
