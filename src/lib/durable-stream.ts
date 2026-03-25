export interface DurableStreamAppendResult {
  body: string;
  nextOffset: string;
}

export interface DurableStreamHeadResult {
  exists: boolean;
  nextOffset: string | null;
}

export interface DurableStreamBootstrapPart {
  contentType: string | null;
  body: string;
}

export interface DurableStreamBootstrapResult {
  snapshotOffset: string | null;
  nextOffset: string | null;
  upToDate: boolean;
  parts: DurableStreamBootstrapPart[];
}

export const DEFAULT_DURABLE_STREAM_BASE_URL = "https://stream.tonbo.dev";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

async function assertResponseOk(response: Response, allowedStatuses: number[] = []) {
  if (response.ok || allowedStatuses.includes(response.status)) return;
  const text = await response.text();
  throw new Error(text.trim() || `${response.status} ${response.statusText}`);
}

function getNextOffset(response: Response) {
  return response.headers.get("Stream-Next-Offset") ?? response.headers.get("stream-next-offset");
}

function getSnapshotOffset(response: Response) {
  return response.headers.get("Stream-Snapshot-Offset") ?? response.headers.get("stream-snapshot-offset");
}

function getUpToDate(response: Response) {
  const value = response.headers.get("Stream-Up-To-Date") ?? response.headers.get("stream-up-to-date");
  return value === "true";
}

function getMultipartBoundary(contentType: string) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").replace(/^"|"$/g, "").trim() || null;
}

function parseMultipartHeaders(headerBlock: string) {
  const headers = new Map<string, string>();
  for (const line of headerBlock.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const name = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (name) headers.set(name, value);
  }
  return headers;
}

function parseMultipartMixed(body: string, boundary: string): DurableStreamBootstrapPart[] {
  const normalized = body.replace(/\r\n/g, "\n");
  const marker = `--${boundary}`;
  const segments = normalized.split(marker);
  const parts: DurableStreamBootstrapPart[] = [];

  for (const segment of segments) {
    const trimmedStart = segment.replace(/^\n+/, "");
    const trimmed = trimmedStart.trim();
    if (!trimmed || trimmed === "--") continue;

    const bodyWithoutClosing = trimmedStart.replace(/\n--\s*$/, "");
    const sep = bodyWithoutClosing.indexOf("\n\n");
    if (sep === -1) continue;

    const headers = parseMultipartHeaders(bodyWithoutClosing.slice(0, sep));
    const partBody = bodyWithoutClosing.slice(sep + 2).replace(/\n$/, "");
    parts.push({ contentType: headers.get("content-type") ?? null, body: partBody });
  }
  return parts;
}

export function createDurableStreamClient(baseUrl: string) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request(path: string, init: RequestInit = {}, options: { timeoutMs?: number | null } = {}) {
    const { timeoutMs = 10_000 } = options;
    const signal = init.signal ?? (timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs));
    return fetch(`${normalizedBaseUrl}${path}`, { ...init, ...(signal ? { signal } : {}) });
  }

  function streamPath(bucket: string, streamId: string) {
    return `/ds/${encodeSegment(bucket)}/${encodeSegment(streamId)}`;
  }

  return {
    async ensureBucket(bucket: string) {
      const response = await request(`/ds/${encodeSegment(bucket)}`, { method: "PUT" });
      await assertResponseOk(response, [409]);
    },

    async createStream(bucket: string, streamId: string) {
      const response = await request(streamPath(bucket, streamId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      await assertResponseOk(response, [409]);
    },

    async appendJson<T>(bucket: string, streamId: string, payload: T): Promise<DurableStreamAppendResult> {
      const body = JSON.stringify(payload);
      const response = await request(streamPath(bucket, streamId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      await assertResponseOk(response);
      const nextOffset = getNextOffset(response);
      if (!nextOffset) throw new Error("Append response missing Stream-Next-Offset");
      return { body, nextOffset };
    },

    async publishSnapshot(bucket: string, streamId: string, offset: string, body: string) {
      const response = await request(
        `${streamPath(bucket, streamId)}/snapshot/${encodeSegment(offset)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body },
      );
      await assertResponseOk(response);
    },

    async bootstrap(bucket: string, streamId: string): Promise<DurableStreamBootstrapResult | null> {
      const response = await request(`${streamPath(bucket, streamId)}/bootstrap`, {
        method: "GET",
        headers: { Accept: "multipart/mixed" },
      });
      if (response.status === 404) return null;
      await assertResponseOk(response);

      const contentType = response.headers.get("Content-Type") ?? "";
      const boundary = getMultipartBoundary(contentType);
      if (!boundary) throw new Error("Bootstrap response missing multipart boundary");

      const body = await response.text();
      return {
        snapshotOffset: getSnapshotOffset(response),
        nextOffset: getNextOffset(response),
        upToDate: getUpToDate(response),
        parts: parseMultipartMixed(body, boundary),
      };
    },

    async head(bucket: string, streamId: string): Promise<DurableStreamHeadResult> {
      const response = await request(streamPath(bucket, streamId), { method: "HEAD" });
      if (response.status === 404) return { exists: false, nextOffset: null };
      await assertResponseOk(response);
      return { exists: true, nextOffset: getNextOffset(response) };
    },
  };
}

export function getDurableStreamBaseUrl() {
  return process.env.DURABLE_STREAM_BASE_URL?.trim() || DEFAULT_DURABLE_STREAM_BASE_URL;
}

export function getDurableStreamClient() {
  return createDurableStreamClient(getDurableStreamBaseUrl());
}
