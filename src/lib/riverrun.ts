export interface RiverrunAppendResult {
  body: string;
  nextOffset: string;
}

export interface RiverrunHeadResult {
  exists: boolean;
  nextOffset: string | null;
}

export interface RiverrunBootstrapPart {
  contentType: string | null;
  body: string;
}

export interface RiverrunBootstrapResult {
  snapshotOffset: string | null;
  nextOffset: string | null;
  upToDate: boolean;
  parts: RiverrunBootstrapPart[];
}

export const DEFAULT_RIVERRUN_BASE_URL = "https://stream.tonbo.dev";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

function decodeHeaderValue(value: string) {
  return value.replace(/^"|"$/g, "");
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  return text.trim() || `${response.status} ${response.statusText}`;
}

async function assertResponseOk(response: Response, allowedStatuses: number[] = []) {
  if (response.ok || allowedStatuses.includes(response.status)) {
    return;
  }

  throw new Error(await readErrorMessage(response));
}

function getNextOffset(response: Response) {
  return response.headers.get("Stream-Next-Offset")
    ?? response.headers.get("stream-next-offset");
}

function getSnapshotOffset(response: Response) {
  return response.headers.get("Stream-Snapshot-Offset")
    ?? response.headers.get("stream-snapshot-offset");
}

function getUpToDate(response: Response) {
  const value = response.headers.get("Stream-Up-To-Date")
    ?? response.headers.get("stream-up-to-date");
  return value === "true";
}

function getMultipartBoundary(contentType: string) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    return null;
  }

  return decodeHeaderValue(match[1] ?? match[2] ?? "").trim() || null;
}

function parseMultipartHeaders(headerBlock: string) {
  const headers = new Map<string, string>();

  for (const line of headerBlock.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (name) {
      headers.set(name, value);
    }
  }

  return headers;
}

function parseMultipartMixed(body: string, boundary: string): RiverrunBootstrapPart[] {
  const normalized = body.replace(/\r\n/g, "\n");
  const marker = `--${boundary}`;
  const segments = normalized.split(marker);
  const parts: RiverrunBootstrapPart[] = [];

  for (const segment of segments) {
    const trimmedStart = segment.replace(/^\n+/, "");
    const trimmed = trimmedStart.trim();
    if (!trimmed || trimmed === "--") {
      continue;
    }

    const bodyWithoutClosing = trimmedStart.replace(/\n--\s*$/, "");
    const separatorIndex = bodyWithoutClosing.indexOf("\n\n");
    if (separatorIndex === -1) {
      continue;
    }

    const headerBlock = bodyWithoutClosing.slice(0, separatorIndex);
    const partBody = bodyWithoutClosing
      .slice(separatorIndex + 2)
      .replace(/\n$/, "");
    const headers = parseMultipartHeaders(headerBlock);

    parts.push({
      contentType: headers.get("content-type") ?? null,
      body: partBody,
    });
  }

  return parts;
}

export function createRiverrunClient(baseUrl: string) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request(
    path: string,
    init: RequestInit = {},
    options: { timeoutMs?: number | null } = {},
  ) {
    const { timeoutMs = 10_000 } = options;
    const signal = init.signal ?? (
      timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs)
    );

    return fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      ...(signal ? { signal } : {}),
    });
  }

  function streamPath(bucket: string, streamId: string) {
    return `/ds/${encodeSegment(bucket)}/${encodeSegment(streamId)}`;
  }

  return {
    async createStream(bucket: string, streamId: string) {
      const response = await request(streamPath(bucket, streamId), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
      });

      await assertResponseOk(response, [409]);
    },

    async appendJson<T>(bucket: string, streamId: string, payload: T): Promise<RiverrunAppendResult> {
      const body = JSON.stringify(payload);
      const response = await request(streamPath(bucket, streamId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      await assertResponseOk(response);

      const nextOffset = getNextOffset(response);
      if (!nextOffset) {
        throw new Error("Riverrun append response did not include Stream-Next-Offset");
      }

      return { body, nextOffset };
    },

    async publishSnapshot(bucket: string, streamId: string, offset: string, body: string) {
      const response = await request(
        `${streamPath(bucket, streamId)}/snapshot/${encodeSegment(offset)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body,
        },
      );

      await assertResponseOk(response);
    },

    async getLatestSnapshot<T>(bucket: string, streamId: string): Promise<T | null> {
      const response = await request(`${streamPath(bucket, streamId)}/snapshot`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 404) {
        return null;
      }

      await assertResponseOk(response);

      const text = await response.text();
      if (!text.trim()) {
        return null;
      }

      return JSON.parse(text) as T;
    },

    async bootstrap(bucket: string, streamId: string): Promise<RiverrunBootstrapResult | null> {
      const response = await request(`${streamPath(bucket, streamId)}/bootstrap`, {
        method: "GET",
        headers: {
          Accept: "multipart/mixed",
        },
      });

      if (response.status === 404) {
        return null;
      }

      await assertResponseOk(response);
      const contentType = response.headers.get("Content-Type") ?? "";
      const boundary = getMultipartBoundary(contentType);
      if (!boundary) {
        throw new Error("Riverrun bootstrap response did not include a multipart boundary");
      }

      const body = await response.text();
      return {
        snapshotOffset: getSnapshotOffset(response),
        nextOffset: getNextOffset(response),
        upToDate: getUpToDate(response),
        parts: parseMultipartMixed(body, boundary),
      };
    },

    async head(bucket: string, streamId: string): Promise<RiverrunHeadResult> {
      const response = await request(streamPath(bucket, streamId), {
        method: "HEAD",
      });

      if (response.status === 404) {
        return { exists: false, nextOffset: null };
      }

      await assertResponseOk(response);

      return {
        exists: true,
        nextOffset: getNextOffset(response),
      };
    },

    async tailSse(
      bucket: string,
      streamId: string,
      offset = "now",
      signal?: AbortSignal,
    ) {
      const response = await request(
        `${streamPath(bucket, streamId)}?offset=${encodeSegment(offset)}&live=sse`,
        {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
          },
          ...(signal ? { signal } : {}),
        },
        { timeoutMs: null },
      );

      await assertResponseOk(response);
      return response;
    },
  };
}

export function getRiverrunBaseUrl() {
  return process.env.RIVERRUN_BASE_URL?.trim() || DEFAULT_RIVERRUN_BASE_URL;
}

export function getRiverrunClient() {
  return createRiverrunClient(getRiverrunBaseUrl());
}
