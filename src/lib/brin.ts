const BRIN_BASE = "https://api.brin.sh";
const SCORE_THRESHOLD = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface BrinResult {
  score: number;
  verdict: string;
  confidence: string;
  threats?: Array<{ type: string; severity: string; detail: string }>;
}

export interface BrinScanResult extends BrinResult {
  safe: boolean;
  url: string;
}

const cache = new Map<string, { result: BrinResult; expiry: number }>();

function buildBrinPath(url: string): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname || pathname === "") {
    return `/domain/${parsed.hostname}`;
  }
  return `/page/${parsed.hostname}${pathname}`;
}

export async function scanUrl(url: string): Promise<BrinScanResult> {
  const path = buildBrinPath(url);
  const cached = cache.get(path);
  if (cached && cached.expiry > Date.now()) {
    return { ...cached.result, safe: cached.result.score >= SCORE_THRESHOLD, url };
  }

  try {
    const res = await fetch(`${BRIN_BASE}${path}?tolerance=lenient`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { score: 100, verdict: "unknown", confidence: "low", safe: true, url };
    }
    const data: BrinResult = await res.json();
    cache.set(path, { result: data, expiry: Date.now() + CACHE_TTL_MS });
    return { ...data, safe: data.score >= SCORE_THRESHOLD, url };
  } catch {
    return { score: 100, verdict: "unknown", confidence: "low", safe: true, url };
  }
}

export async function scanUrls(urls: string[]): Promise<BrinScanResult[]> {
  if (urls.length === 0) return [];

  const results: BrinScanResult[] = new Array(urls.length);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < urls.length; i++) {
    const path = buildBrinPath(urls[i]);
    const cached = cache.get(path);
    if (cached && cached.expiry > Date.now()) {
      results[i] = { ...cached.result, safe: cached.result.score >= SCORE_THRESHOLD, url: urls[i] };
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) return results;

  if (uncachedIndices.length <= 3) {
    const scans = await Promise.all(uncachedIndices.map((i) => scanUrl(urls[i])));
    for (let j = 0; j < uncachedIndices.length; j++) {
      results[uncachedIndices[j]] = scans[j];
    }
    return results;
  }

  try {
    const lookups = uncachedIndices.map((i) => {
      const parsed = new URL(urls[i]);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      const isApex = !pathname || pathname === "";
      return {
        origin: isApex ? "domain" : "page",
        identifier: isApex ? parsed.hostname : `${parsed.hostname}${pathname}`,
      };
    });

    const res = await fetch(`${BRIN_BASE}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookups, tolerance: "lenient" }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      const bulkResults: BrinResult[] = data.results ?? [];
      for (let j = 0; j < uncachedIndices.length; j++) {
        const idx = uncachedIndices[j];
        const brinResult = bulkResults[j] ?? { score: 100, verdict: "unknown", confidence: "low" };
        const path = buildBrinPath(urls[idx]);
        cache.set(path, { result: brinResult, expiry: Date.now() + CACHE_TTL_MS });
        results[idx] = { ...brinResult, safe: brinResult.score >= SCORE_THRESHOLD, url: urls[idx] };
      }
    } else {
      for (const idx of uncachedIndices) {
        results[idx] = { score: 100, verdict: "unknown", confidence: "low", safe: true, url: urls[idx] };
      }
    }
  } catch {
    for (const idx of uncachedIndices) {
      results[idx] = { score: 100, verdict: "unknown", confidence: "low", safe: true, url: urls[idx] };
    }
  }

  return results;
}
