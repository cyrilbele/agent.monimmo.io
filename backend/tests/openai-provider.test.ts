import { describe, expect, it } from "bun:test";
import { OpenAIProvider } from "../src/ai/openai-provider";

const withMockedFetch = async (
  handler: (url: string, init: RequestInit | undefined) => Promise<Response>,
  callback: () => Promise<void>,
): Promise<void> => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    },
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;

  try {
    await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
};

describe("OpenAIProvider", () => {
  it("transcrit un vocal avec Whisper", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async (url, init) => {
        expect(url).toBe("https://openai.example.test/v1/audio/transcriptions");
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)?.Authorization).toContain("Bearer");
        return new Response(JSON.stringify({ text: "Bonjour tout le monde" }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      },
      async () => {
        const result = await provider.transcribeVocal({
          fileName: "sample.wav",
          mimeType: "audio/wav",
          audioData: Buffer.from("voice"),
        });

        expect(result.transcript).toBe("Bonjour tout le monde");
        expect(result.summary).toContain("Bonjour");
        expect(result.confidence).toBe(0.9);
      },
    );
  });

  it("remonte une erreur quand la transcription échoue", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async () => {
        return new Response("upstream error", { status: 503 });
      },
      async () => {
        await expect(
          provider.transcribeVocal({
            fileName: "sample.wav",
            mimeType: "audio/wav",
            audioData: Buffer.from("voice"),
          }),
        ).rejects.toThrow("OpenAI transcription failed (503)");
      },
    );
  });

  it("parse les insights vocaux depuis output_text", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async (url) => {
        expect(url).toBe("https://openai.example.test/v1/responses");
        return new Response(
          JSON.stringify({
            output_text: '{"insights":{"pieces":4},"confidence":0.78}',
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      },
      async () => {
        const result = await provider.extractVocalInsights({
          transcript: "transcript",
          summary: "summary",
        });

        expect(result.insights).toEqual({ pieces: 4 });
        expect(result.confidence).toBe(0.78);
      },
    );
  });

  it("détecte le type vocal même avec JSON encapsulé", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async () => {
        return new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    text: 'Voici la réponse: {"vocalType":"VISITE_SUIVI","confidence":"0.93","reasoning":"Contexte visite"}',
                  },
                ],
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      },
      async () => {
        const result = await provider.detectVocalType({
          transcript: "visite de suivi",
          summary: "summary",
        });

        expect(result.vocalType).toBe("VISITE_SUIVI");
        expect(result.confidence).toBe(0.93);
        expect(result.reasoning).toContain("Contexte");
      },
    );
  });

  it("retombe sur des valeurs safe si le JSON est invalide", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async () => {
        return new Response(
          JSON.stringify({
            output_text: "pas de json ici",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      },
      async () => {
        const detected = await provider.detectVocalType({
          transcript: "texte",
          summary: "",
        });
        expect(detected.vocalType).toBeNull();
        expect(detected.confidence).toBe(0.2);

        const extracted = await provider.extractInitialVisitPropertyParams({
          transcript: "texte",
          summary: "",
        });

        expect(extracted.title).toBeNull();
        expect(extracted.address).toBeNull();
        expect(extracted.price).toBeNull();
        expect(extracted.details).toEqual({});
        expect(extracted.confidence).toBe(0.2);
      },
    );
  });

  it("extrait les paramètres de visite initiale et normalise le prix", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async () => {
        return new Response(
          JSON.stringify({
            output_text:
              '{"title":"Maison familiale","address":"10 rue des Fleurs","city":"Lyon","postalCode":"69003","price":"412345.67","details":{"rooms":5},"confidence":1.5}',
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      },
      async () => {
        const result = await provider.extractInitialVisitPropertyParams({
          transcript: "visite",
          summary: "",
        });

        expect(result.title).toBe("Maison familiale");
        expect(result.address).toBe("10 rue des Fleurs");
        expect(result.city).toBe("Lyon");
        expect(result.postalCode).toBe("69003");
        expect(result.price).toBe(412346);
        expect(result.details).toEqual({ rooms: 5 });
        expect(result.confidence).toBe(1);
      },
    );
  });

  it("remonte une erreur si le endpoint responses échoue", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test_key",
      baseUrl: "https://openai.example.test/v1",
    });

    await withMockedFetch(
      async () => {
        return new Response("bad gateway", { status: 502 });
      },
      async () => {
        await expect(
          provider.extractVocalInsights({
            transcript: "texte",
            summary: "",
          }),
        ).rejects.toThrow("OpenAI responses failed (502)");
      },
    );
  });
});
