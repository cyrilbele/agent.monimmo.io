type FetchLike = typeof fetch;

type ExternalFetchInput = {
  service: string;
  url: string;
  method: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}:${error.message}`;
  }

  return String(error);
};

export const externalFetch = async (input: ExternalFetchInput): Promise<Response> => {
  const startedAt = Date.now();
  const method = input.method.toUpperCase();

  console.info(`[HTTP][OUT] -> service=${input.service} method=${method} url=${input.url}`);

  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method,
      headers: input.headers,
      body: input.body,
      signal: input.signal,
    });

    const durationMs = Date.now() - startedAt;
    console.info(
      `[HTTP][OUT] <- service=${input.service} method=${method} url=${input.url} status=${response.status} durationMs=${durationMs}`,
    );

    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[HTTP][OUT] !! service=${input.service} method=${method} url=${input.url} durationMs=${durationMs} error=${toErrorMessage(error)}`,
    );
    throw error;
  }
};
