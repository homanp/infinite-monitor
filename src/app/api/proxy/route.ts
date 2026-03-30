import { scanUrl } from "@/lib/brin";

interface ProxyResponsePayload {
  body: Uint8Array;
  contentType: string;
  status: number;
}

interface CachedProxyResponse extends ProxyResponsePayload {
  freshUntil: number;
  staleUntil: number;
}

const CACHE_TTL_MS = 30_000;
const STALE_TTL_MS = 5 * 60_000;
const MAX_CACHE_BYTES = 1_000_000;

const proxyCache = new Map<string, CachedProxyResponse>();
const inflightProxyRequests = new Map<string, Promise<ProxyResponsePayload>>();

function buildProxyResponse(
  payload: ProxyResponsePayload,
  cacheStatus: "HIT" | "MISS" | "STALE",
  upstreamStatus = payload.status,
) {
  return new Response(payload.body.slice(), {
    status: payload.status,
    headers: {
      "Content-Type": payload.contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "X-Proxy-Cache": cacheStatus,
      "X-Proxy-Upstream-Status": String(upstreamStatus),
    },
  });
}

function getFreshCacheEntry(target: string): CachedProxyResponse | null {
  const cached = proxyCache.get(target);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    proxyCache.delete(target);
    return null;
  }
  return cached.freshUntil > Date.now() ? cached : null;
}

function getStaleCacheEntry(target: string): CachedProxyResponse | null {
  const cached = proxyCache.get(target);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    proxyCache.delete(target);
    return null;
  }
  return cached;
}

function maybeCacheResponse(target: string, payload: ProxyResponsePayload) {
  if (payload.status < 200 || payload.status >= 300) return;
  if (payload.body.byteLength > MAX_CACHE_BYTES) return;

  proxyCache.set(target, {
    ...payload,
    freshUntil: Date.now() + CACHE_TTL_MS,
    staleUntil: Date.now() + STALE_TTL_MS,
  });
}

async function fetchUpstream(
  target: string,
  authorization?: string | null,
): Promise<ProxyResponsePayload> {
  if (!authorization) {
    const existing = inflightProxyRequests.get(target);
    if (existing) {
      return existing;
    }
  }

  const fetchHeaders: Record<string, string> = {
    "User-Agent": "infinite-monitor/1.0",
    Accept: "application/json, text/plain, */*",
  };
  if (authorization) fetchHeaders["Authorization"] = authorization;

  const request = (async () => {
    const upstream = await fetch(target, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(15_000),
    });

    const contentType =
      upstream.headers.get("content-type") ?? "application/json";
    const body = new Uint8Array(await upstream.arrayBuffer());
    const payload = { body, contentType, status: upstream.status };

    if (!authorization) maybeCacheResponse(target, payload);
    return payload;
  })().finally(() => {
    inflightProxyRequests.delete(target);
  });

  if (!authorization) inflightProxyRequests.set(target, request);
  return request;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsJson(body: unknown, init: { status: number }) {
  return Response.json(body, {
    status: init.status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

function validateTarget(
  request: Request,
): { target: string } | Response {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return corsJson({ error: "url parameter required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return corsJson({ error: "invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return corsJson({ error: "only http/https allowed" }, { status: 400 });
  }

  return { target };
}

async function scanTarget(target: string): Promise<Response | null> {
  try {
    const scan = await scanUrl(target);
    if (!scan.safe) {
      return corsJson(
        {
          error: "blocked_by_security",
          verdict: scan.verdict,
          score: scan.score,
          threats: scan.threats,
        },
        { status: 403 },
      );
    }
  } catch {
    // Allow request through if brin is unreachable
  }
  return null;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const validated = validateTarget(request);
  if (validated instanceof Response) return validated;
  const { target } = validated;

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    const freshCacheHit = getFreshCacheEntry(target);
    if (freshCacheHit) {
      return buildProxyResponse(freshCacheHit, "HIT");
    }
  }

  const blocked = await scanTarget(target);
  if (blocked) return blocked;

  const staleCacheHit = !authorization ? getStaleCacheEntry(target) : null;

  try {
    const upstream = await fetchUpstream(target, authorization);
    if ((upstream.status < 200 || upstream.status >= 300) && staleCacheHit) {
      return buildProxyResponse(staleCacheHit, "STALE", upstream.status);
    }

    return buildProxyResponse(upstream, "MISS");
  } catch (err) {
    if (staleCacheHit) {
      return buildProxyResponse(staleCacheHit, "STALE");
    }

    return corsJson(
      { error: "upstream fetch failed", detail: String(err) },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const validated = validateTarget(request);
  if (validated instanceof Response) return validated;
  const { target } = validated;

  const blocked = await scanTarget(target);
  if (blocked) return blocked;

  try {
    const reqBody = new Uint8Array(await request.arrayBuffer());
    const reqContentType = request.headers.get("content-type");
    const authorization = request.headers.get("authorization");

    const headers: Record<string, string> = {
      "User-Agent": "infinite-monitor/1.0",
    };
    if (reqContentType) headers["Content-Type"] = reqContentType;
    if (authorization) headers["Authorization"] = authorization;

    const upstream = await fetch(target, {
      method: "POST",
      headers,
      body: reqBody,
      signal: AbortSignal.timeout(15_000),
    });

    const contentType =
      upstream.headers.get("content-type") ?? "application/json";
    const body = new Uint8Array(await upstream.arrayBuffer());

    return buildProxyResponse({ body, contentType, status: upstream.status }, "MISS");
  } catch (err) {
    return corsJson(
      { error: "upstream fetch failed", detail: String(err) },
      { status: 502 },
    );
  }
}
