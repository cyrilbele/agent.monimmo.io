type ErrorResponse = {
  code: string;
  message: string;
  details?: unknown;
};

const json = (data: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });

const notFound = (): Response => {
  const body: ErrorResponse = {
    code: "NOT_FOUND",
    message: "Route introuvable",
  };

  return json(body, { status: 404 });
};

export const createApp = () => ({
  fetch(request: Request): Response {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" }, { status: 200 });
    }

    return notFound();
  },
});

