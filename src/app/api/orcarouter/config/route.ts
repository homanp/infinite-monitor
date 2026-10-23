import { resolveOrcaOrigins } from "@/lib/orcarouter/config";

export const dynamic = "force-dynamic";

/**
 * Public (non-secret) origin configuration so the browser builds the
 * authorization URL against the same auth origin the server will exchange
 * against. Supports self-hosted overrides without exposing any secret.
 */
export async function GET() {
  const { authBase, apiBase } = resolveOrcaOrigins();
  return Response.json(
    { authBase, apiBase },
    { headers: { "Cache-Control": "no-store" } }
  );
}
