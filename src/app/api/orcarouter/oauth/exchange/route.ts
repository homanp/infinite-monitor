import { resolveOrcaOrigins } from "@/lib/orcarouter/config";
import { exchangeAuthorizationCode, OrcaPkceError } from "@/lib/orcarouter/pkce";

export const dynamic = "force-dynamic";

const MAX_CODE_LENGTH = 4_096;
const MAX_VERIFIER_LENGTH = 512;

/**
 * Exchange a one-time authorization code for a durable OrcaRouter API key.
 *
 * The exchange happens on the auth origin. The verifier is used once here and
 * is never logged, persisted or echoed back.
 */
export async function POST(request: Request) {
  let body: { code?: unknown; codeVerifier?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const codeVerifier = typeof body.codeVerifier === "string" ? body.codeVerifier.trim() : "";

  if (!code || code.length > MAX_CODE_LENGTH || !codeVerifier || codeVerifier.length > MAX_VERIFIER_LENGTH) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { authBase } = resolveOrcaOrigins();

  try {
    const result = await exchangeAuthorizationCode({ authBase, code, verifier: codeVerifier });
    return Response.json(
      { key: result.key, scope: result.scope, userId: result.userId },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const errorCode = error instanceof OrcaPkceError ? error.code : "network";
    const status = errorCode === "rate_limited"
      ? 429
      : errorCode === "code_rejected" || errorCode === "insufficient_scope"
        ? 403
        : errorCode === "invalid_request"
          ? 400
          : 502;
    const message = error instanceof OrcaPkceError
      ? error.message
      : "Could not complete the OrcaRouter authorization.";
    return Response.json({ error: errorCode, message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
