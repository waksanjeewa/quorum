// Test-only fetch stubs for HTTP-backed adapters. Lives under contract/ so the build excludes it.

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

export function stubFetch(handler: Handler): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fetch whose POST hangs until the request's AbortSignal fires (for the abort contract test). */
export function hangingFetch(): typeof fetch {
  return stubFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
  );
}
