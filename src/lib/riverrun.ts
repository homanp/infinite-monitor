export interface RiverrunAppendResult {
  body: string;
  nextOffset: string;
}

export interface RiverrunHeadResult {
  exists: boolean;
  nextOffset: string | null;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function encodeSegment(value: string) {
  return encodeURIComponent(value);
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

export function createRiverrunClient(baseUrl: string) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request(path: string, init: RequestInit = {}) {
    return fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(10_000),
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

    async bootstrap<T>(bucket: string, streamId: string): Promise<T | null> {
      const response = await request(`${streamPath(bucket, streamId)}/bootstrap`, {
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

    async tailSse(bucket: string, streamId: string, offset = "now") {
      const response = await request(
        `${streamPath(bucket, streamId)}?offset=${encodeSegment(offset)}&live=sse`,
        {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
          },
        },
      );

      await assertResponseOk(response);
      return response;
    },
  };
}

export function getOptionalRiverrunClient() {
  const baseUrl = process.env.RIVERRUN_BASE_URL;
  if (!baseUrl) {
    return null;
  }
  return createRiverrunClient(baseUrl);
}

export function getRequiredRiverrunClient() {
  const client = getOptionalRiverrunClient();
  if (!client) {
    throw new Error("RIVERRUN_BASE_URL is not configured");
  }
  return client;
}
