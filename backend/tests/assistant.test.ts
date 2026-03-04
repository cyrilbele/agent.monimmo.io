import { beforeAll, describe, expect, it } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { assistantService } from "../src/assistant/service";
import { assistantWebSearchProvider } from "../src/assistant/web-search";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { aiCallLogs, assistantMessages, properties, users } from "../src/db/schema";
import { propertiesService } from "../src/properties/service";
import { createApp } from "../src/server";
import { usersService } from "../src/users/service";

const registerAndGetToken = async (suffix: string): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `assistant.${suffix}.${crypto.randomUUID()}@monimmo.fr`,
        password: "MonimmoPwd123!",
        firstName: "Assistant",
        lastName: "Test",
      }),
    }),
  );

  expect(response.status).toBe(201);
  const payload = await response.json();
  return payload.accessToken as string;
};

const getOrgIdFromToken = async (token: string): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    }),
  );

  expect(response.status).toBe(200);
  const payload = await response.json();
  return payload.user.orgId as string;
};

const getMeFromToken = async (
  token: string,
): Promise<{ orgId: string; userId: string }> => {
  const response = await createApp().fetch(
    new Request("http://localhost/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    }),
  );

  expect(response.status).toBe(200);
  const payload = await response.json();
  return {
    orgId: payload.user.orgId as string,
    userId: payload.user.id as string,
  };
};

describe("assistant endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("garde un thread persistant puis le réinitialise manuellement", async () => {
    const token = await registerAndGetToken("thread");

    const getInitial = await createApp().fetch(
      new Request("http://localhost/assistant/conversation", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(getInitial.status).toBe(200);
    const initialConversation = await getInitial.json();
    expect(initialConversation.id).toBeString();
    expect(initialConversation.messages.length).toBeGreaterThan(0);
    expect(initialConversation.messages[0]?.role).toBe("ASSISTANT");

    const postMessage = await createApp().fetch(
      new Request("http://localhost/assistant/messages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "Bonjour assistant, peux-tu m'aider ?",
        }),
      }),
    );
    expect(postMessage.status).toBe(200);
    const posted = await postMessage.json();
    expect(posted.conversation.id).toBe(initialConversation.id);
    expect(posted.conversation.messages.length).toBeGreaterThan(initialConversation.messages.length);

    const getAfterPost = await createApp().fetch(
      new Request("http://localhost/assistant/conversation", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(getAfterPost.status).toBe(200);
    const afterPostConversation = await getAfterPost.json();
    expect(afterPostConversation.id).toBe(initialConversation.id);
    expect(afterPostConversation.messages.length).toBe(posted.conversation.messages.length);

    const resetResponse = await createApp().fetch(
      new Request("http://localhost/assistant/conversation/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(resetResponse.status).toBe(200);
    const resetConversation = await resetResponse.json();
    expect(resetConversation.id).toBe(initialConversation.id);
    expect(resetConversation.messages.length).toBe(1);
    expect(resetConversation.messages[0]?.role).toBe("ASSISTANT");
  });

  it("stream les réponses assistant avec deltas puis payload final", async () => {
    const token = await registerAndGetToken("stream");

    const streamResponse = await createApp().fetch(
      new Request("http://localhost/assistant/messages/stream", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "bonjour",
        }),
      }),
    );

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
    const raw = await streamResponse.text();

    const blocks = raw
      .split("\n\n")
      .map((block) => block.trim())
      .filter((block) => block.length > 0);

    const events = blocks.map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:")) ?? "event: message";
      const dataLine = lines.find((line) => line.startsWith("data:")) ?? "data: {}";

      return {
        event: eventLine.slice("event:".length).trim(),
        data: dataLine.slice("data:".length).trim(),
      };
    });

    const deltaEvents = events.filter((event) => event.event === "delta");
    const finalEvent = events.find((event) => event.event === "final");

    expect(deltaEvents.length).toBeGreaterThan(0);
    expect(finalEvent).toBeDefined();

    const finalPayload = JSON.parse(finalEvent?.data ?? "{}") as {
      assistantMessage?: { role?: string; text?: string };
    };
    expect(finalPayload.assistantMessage?.role).toBe("ASSISTANT");
    expect((finalPayload.assistantMessage?.text ?? "").length).toBeGreaterThan(0);
  });

  it("crée un client directement depuis une demande assistant", async () => {
    const token = await registerAndGetToken("actions");
    const orgId = await getOrgIdFromToken(token);
    const phone = `06${Math.floor(Math.random() * 10_000_0000)
      .toString()
      .padStart(8, "0")}`;

    const createResponse = await createApp().fetch(
      new Request("http://localhost/assistant/messages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: `Ajoute un nouveau client Direct Test ${phone}`,
        }),
      }),
    );
    expect(createResponse.status).toBe(200);
    const payload = await createResponse.json();
    expect(payload.assistantMessage?.text).toContain("Client créé");

    const createdUser = await db.query.users.findFirst({
      where: and(eq(users.orgId, orgId), eq(users.phone, phone)),
    });
    expect(createdUser).toBeDefined();
    expect(createdUser?.firstName).toBe("Direct");
  });

  it("n'utilise pas le web search sans demande explicite et ne renvoie pas la soul dans chaque réponse", async () => {
    const token = await registerAndGetToken("local-only");
    const soul = "Tu es Monimmo, un assistant immobilier pragmatique.";

    const setSoul = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assistantSoul: soul,
        }),
      }),
    );
    expect(setSoul.status).toBe(200);

    const reset = await createApp().fetch(
      new Request("http://localhost/assistant/conversation/reset", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(reset.status).toBe(200);

    const originalSearch = assistantWebSearchProvider.search;
    let called = false;
    assistantWebSearchProvider.search = async () => {
      called = true;
      return { citations: [], trace: null };
    };

    try {
      const response = await createApp().fetch(
        new Request("http://localhost/assistant/messages", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: "quelle est la surface de la maison à valbonne ?",
          }),
        }),
      );
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.assistantMessage.role).toBe("ASSISTANT");
      expect(payload.assistantMessage.text).not.toContain(soul);
      expect(called).toBe(false);
    } finally {
      assistantWebSearchProvider.search = originalSearch;
    }
  });

  it("masque les anciens messages assistant contenant la soul (migration douce)", async () => {
    const token = await registerAndGetToken("soul-cleanup");
    const orgId = await getOrgIdFromToken(token);
    const leakedSoul = "Tu es Monimmo, un assistant immobilier pragmatique, clair et orienté action pour les agents français.";

    const initialConversationResponse = await createApp().fetch(
      new Request("http://localhost/assistant/conversation", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(initialConversationResponse.status).toBe(200);
    const initialConversation = await initialConversationResponse.json();

    await db.insert(assistantMessages).values({
      id: crypto.randomUUID(),
      conversationId: initialConversation.id,
      orgId,
      role: "ASSISTANT",
      text: leakedSoul,
      citationsJson: "[]",
      pendingActionId: null,
      createdAt: new Date(),
    });

    const refreshedConversationResponse = await createApp().fetch(
      new Request("http://localhost/assistant/conversation", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(refreshedConversationResponse.status).toBe(200);
    const refreshedConversation = await refreshedConversationResponse.json();
    const leakedVisible = refreshedConversation.messages.some(
      (message: { text: string }) => message.text === leakedSoul,
    );
    expect(leakedVisible).toBe(false);
  });

  it("expose toolCreate et toolUpdate en exécution directe", async () => {
    const token = await registerAndGetToken("tools-create-update");
    const me = await getMeFromToken(token);
    const phone = `06${Math.floor(Math.random() * 10_000_0000)
      .toString()
      .padStart(8, "0")}`;

    const conversationResponse = await createApp().fetch(
      new Request("http://localhost/assistant/conversation", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(conversationResponse.status).toBe(200);
    const conversation = await conversationResponse.json();
    const conversationId = conversation.id as string;

    const createResult = await assistantService.toolCreate({
      orgId: me.orgId,
      userId: me.userId,
      conversationId,
      objectType: "client",
      params: {
        firstName: "Tool",
        lastName: "Create",
        phone,
      },
    });
    expect(createResult.status).toBe("EXECUTED");
    if (createResult.status !== "EXECUTED") {
      throw new Error("createResult should execute directly");
    }
    const createdClientId = createResult.objectId;
    expect(createdClientId).toBeString();

    const updateResult = await assistantService.toolUpdate({
      orgId: me.orgId,
      userId: me.userId,
      conversationId,
      objectType: "client",
      objectId: createdClientId,
      params: {
        phone: "0611223344",
      },
    });
    expect(updateResult.status).toBe("EXECUTED");
    if (updateResult.status !== "EXECUTED") {
      throw new Error("update should execute directly");
    }
    expect(updateResult.objectId).toBe(createdClientId);

    const refreshedClient = await usersService.getById({
      orgId: me.orgId,
      id: createdClientId,
    });
    expect(refreshedClient.phone).toBe("0611223344");
  });

  it("normalise les aliases de mise à jour bien (surface/typebien) et conserve les autres details", async () => {
    const token = await registerAndGetToken("tool-update-bien-alias");
    const me = await getMeFromToken(token);

    const owner = await usersService.create({
      orgId: me.orgId,
      data: {
        firstName: "Owner",
        lastName: "Alias",
        phone: `06${Math.floor(Math.random() * 10_000_0000)
          .toString()
          .padStart(8, "0")}`,
        email: `owner.alias.${crypto.randomUUID()}@monimmo.fr`,
        accountType: "CLIENT",
      },
    });

    const property = await propertiesService.create({
      orgId: me.orgId,
      title: "Bien alias update",
      city: "Valbonne",
      postalCode: "06560",
      address: "1 avenue des Tests",
      ownerUserId: owner.id,
      details: {
        general: { propertyType: "APPARTEMENT" },
        characteristics: { rooms: 4 },
      },
    });

    const conversation = await assistantService.getConversation({
      orgId: me.orgId,
      userId: me.userId,
    });

    const updateResult = await assistantService.toolUpdate({
      orgId: me.orgId,
      userId: me.userId,
      conversationId: conversation.id,
      objectType: "bien",
      objectId: property.id,
      params: {
        surface: "200",
        typebien: "maison",
      },
    });

    expect(updateResult.status).toBe("EXECUTED");
    if (updateResult.status !== "EXECUTED") {
      throw new Error("updateResult should execute directly");
    }

    const refreshed = await propertiesService.getById({
      orgId: me.orgId,
      id: property.id,
    });
    const details = refreshed.details as Record<string, unknown>;
    expect(details.propertyType).toBe("MAISON");
    expect(details.livingArea).toBe(200);
    expect(details.rooms).toBe(4);
  });

  it("retourne des paramètres bien typés avec options pour getParams(bien)", () => {
    const fields = assistantService.toolGetParams({
      objectType: "bien",
    }) as Array<{ key?: string; options?: unknown[] }>;

    expect(fields.length).toBeGreaterThan(0);
    const propertyTypeField = fields.find((field) => field.key === "propertyType");
    expect(propertyTypeField).toBeDefined();
    expect(Array.isArray(propertyTypeField?.options)).toBe(true);
    const optionValues = (propertyTypeField?.options ?? []).map((option) =>
      typeof option === "object" && option !== null ? (option as { value?: unknown }).value : option,
    );
    expect(optionValues.includes("MAISON")).toBe(true);
  });

  it("applique une update structurée depuis un long descriptif quand le contexte bien est fourni", async () => {
    const token = await registerAndGetToken("listing-structured-update");
    const me = await getMeFromToken(token);

    const owner = await usersService.create({
      orgId: me.orgId,
      data: {
        firstName: "Owner",
        lastName: "Listing",
        phone: `06${Math.floor(Math.random() * 10_000_0000)
          .toString()
          .padStart(8, "0")}`,
        email: `owner.listing.${crypto.randomUUID()}@monimmo.fr`,
        accountType: "CLIENT",
      },
    });

    const property = await propertiesService.create({
      orgId: me.orgId,
      title: "Maison Roquefort test",
      city: "Roquefort-les-Pins",
      postalCode: "06330",
      address: "10 avenue des Tests",
      ownerUserId: owner.id,
      details: {
        characteristics: { rooms: 3 },
      },
    });

    const listingText = [
      "Est ce que tu peux ajouter les données du descriptif au bien",
      "",
      "Belle maison de ville 4 pièces de 100m² environ et 93.79m² loi Carrez.",
      "Construite sur un terrain de 527m².",
      "Possibilité de stationner 3 véhicules à l'intérieur de la propriété.",
      "- Chambre 1 : 14.91m²",
      "- Chambre 2 : 11.50m²",
      "- Chambre 3 : 12.78m²",
      "- Salle de bains : 3.96m²",
      "- Salle d'eau : 4.44m²",
      "- WC indépendant : 1.57m²",
      "- WC indépendant : 1.77m²",
      "Cheminée dans le séjour.",
      "Fenêtres en double vitrage.",
      "Fibre optique.",
      "Portail électrique.",
      "Tout à l'égout.",
      "Montant de la taxe foncière : 964€",
      "Régime de la copropriété : Non",
      "Classe énergie : DPE C (147) - GES A (5)",
    ].join("\n");

    const response = await createApp().fetch(
      new Request("http://localhost/assistant/messages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: listingText,
          context: {
            objectType: "bien",
            objectId: property.id,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.assistantMessage.text).toContain("Mise à jour technique appliquée");

    const refreshed = await propertiesService.getById({
      orgId: me.orgId,
      id: property.id,
    });
    const details = refreshed.details as Record<string, unknown>;

    expect(details.propertyType).toBe("MAISON");
    expect(details.rooms).toBe(4);
    expect(details.livingArea).toBe(100);
    expect(details.carrezArea).toBe(93.79);
    expect(details.landArea).toBe(527);
    expect(details.dpeClass).toBe("C");
    expect(details.energyConsumption).toBe(147);
    expect(details.gesClass).toBe("A");
    expect(details.co2Emission).toBe(5);
    expect(details.propertyTax).toBe(964);
    expect(details.parking).toBe("true");
    expect(details.fiber).toBe("true");
    expect(details.isCopropriete).toBe("false");
  });

  it("envoie les définitions tools à OpenAI pour le tour assistant", async () => {
    const token = await registerAndGetToken("openai-tools-defs");
    const originalFetch = globalThis.fetch;
    const originalAiProvider = process.env.AI_PROVIDER;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const capturedBodies: Record<string, unknown>[] = [];
    let responseCallCount = 0;

    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/responses")) {
        const rawBody = typeof init?.body === "string" ? init.body : "";
        const parsedBody =
          rawBody.trim().length > 0 ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        capturedBodies.push(parsedBody);

        responseCallCount += 1;
        if (responseCallCount === 1) {
          return new Response(
            JSON.stringify({
              id: "resp_1",
              output: [
                {
                  type: "function_call",
                  name: "getParams",
                  call_id: "call_get_params_1",
                  arguments: JSON.stringify({
                    objectType: "client",
                  }),
                },
              ],
              usage: {
                input_tokens: 120,
                output_tokens: 24,
                total_tokens: 144,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            id: "resp_2",
            output_text:
              "Pour créer un client, il faut au moins email ou téléphone. Je peux ensuite proposer la création.",
            usage: {
              input_tokens: 80,
              output_tokens: 20,
              total_tokens: 100,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    try {
      const response = await createApp().fetch(
        new Request("http://localhost/assistant/messages", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: "Quels paramètres faut-il pour créer un client ?",
            context: {
              objectType: "bien",
              objectId: "3e4c1cee-465a-4da2-9544-e1ee2bcff85c",
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.assistantMessage.text).toContain("Pour créer un client");
      expect(capturedBodies.length).toBeGreaterThanOrEqual(1);

      const firstBody = capturedBodies[0] ?? {};
      const tools = Array.isArray(firstBody.tools) ? firstBody.tools : [];
      expect(tools.length).toBeGreaterThanOrEqual(5);
      const toolNames = tools
        .map((tool) =>
          tool && typeof tool === "object" && !Array.isArray(tool)
            ? ((tool as { name?: unknown }).name ?? null)
            : null,
        )
        .filter((value): value is string => typeof value === "string");

      expect(toolNames.includes("search")).toBe(true);
      expect(toolNames.includes("get")).toBe(true);
      expect(toolNames.includes("getParams")).toBe(true);
      expect(toolNames.includes("create")).toBe(true);
      expect(toolNames.includes("update")).toBe(true);

      const instructions = typeof firstBody.instructions === "string" ? firstBody.instructions : "";
      expect(instructions).toContain("objectType=bien");
      expect(instructions).toContain("objectId=3e4c1cee-465a-4da2-9544-e1ee2bcff85c");

      const firstInput = Array.isArray(firstBody.input) ? firstBody.input : [];
      const systemMessages = firstInput.filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          (entry as { role?: unknown }).role === "system",
      );
      expect(systemMessages.length).toBe(0);

      const assistantMessages = firstInput.filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          (entry as { role?: unknown }).role === "assistant",
      ) as Array<{ content?: unknown }>;
      expect(assistantMessages.length).toBeGreaterThan(0);
      const assistantContentTypes = assistantMessages
        .flatMap((entry) => (Array.isArray(entry.content) ? entry.content : []))
        .map((content) =>
          content && typeof content === "object" && !Array.isArray(content)
            ? ((content as { type?: unknown }).type ?? null)
            : null,
        )
        .filter((value): value is string => typeof value === "string");
      expect(assistantContentTypes.includes("output_text")).toBe(true);
      expect(assistantContentTypes.includes("input_text")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.AI_PROVIDER = originalAiProvider;
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  it("accepte un function_call create avec des champs à plat (sans params imbriqué)", async () => {
    const token = await registerAndGetToken("openai-create-flat-args");
    const orgId = await getOrgIdFromToken(token);
    const originalFetch = globalThis.fetch;
    const originalAiProvider = process.env.AI_PROVIDER;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    let responseCallCount = 0;

    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/responses")) {
        responseCallCount += 1;
        if (responseCallCount === 1) {
          return new Response(
            JSON.stringify({
              id: "resp_flat_create_1",
              output: [
                {
                  type: "function_call",
                  name: "create",
                  call_id: "call_flat_create_1",
                  arguments: JSON.stringify({
                    objectType: "bien",
                    title: "Appartement centre-ville",
                    propertyType: "APPARTEMENT",
                    address: "11 rue des Tertres",
                    postalCode: "06600",
                    city: "Antibes",
                    owner: {
                      firstName: "Louise",
                      lastName: "Martin",
                      phone: "0601020304",
                      email: `owner.flat.${crypto.randomUUID()}@monimmo.fr`,
                    },
                  }),
                },
              ],
              usage: {
                input_tokens: 200,
                output_tokens: 40,
                total_tokens: 240,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        const rawBody = typeof init?.body === "string" ? init.body : "";
        const parsedBody =
          rawBody.trim().length > 0 ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        const toolOutputCall = Array.isArray(parsedBody.input)
          ? parsedBody.input.find(
              (item) =>
                item &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                (item as { call_id?: unknown }).call_id === "call_flat_create_1",
            )
          : null;
        const toolOutputText =
          toolOutputCall &&
          typeof toolOutputCall === "object" &&
          !Array.isArray(toolOutputCall) &&
          typeof (toolOutputCall as { output?: unknown }).output === "string"
            ? ((toolOutputCall as { output: string }).output ?? "")
            : "";
        const parsedToolOutput =
          toolOutputText.trim().length > 0
            ? (JSON.parse(toolOutputText) as Record<string, unknown>)
            : {};
        const summary =
          typeof parsedToolOutput.summary === "string"
            ? parsedToolOutput.summary
            : "Bien créé.";

        return new Response(
          JSON.stringify({
            id: "resp_flat_create_2",
            output_text: summary,
            usage: {
              input_tokens: 120,
              output_tokens: 22,
              total_tokens: 142,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    try {
      const response = await createApp().fetch(
        new Request("http://localhost/assistant/messages", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: "Crée un bien appartement centre-ville à Antibes",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.assistantMessage.text).toContain("Bien créé");

      const createdProperty = await db.query.properties.findFirst({
        where: and(eq(properties.orgId, orgId), eq(properties.title, "Appartement centre-ville")),
        orderBy: [desc(properties.createdAt), desc(properties.id)],
      });
      expect(createdProperty).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
      process.env.AI_PROVIDER = originalAiProvider;
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  it("déclenche le web search sur demande explicite et stocke prompt/réponse/coût en logs", async () => {
    const token = await registerAndGetToken("web-search");
    const orgId = await getOrgIdFromToken(token);
    const originalSearch = assistantWebSearchProvider.search;
    assistantWebSearchProvider.search = async () => ({
      citations: [
        {
          title: "Source test",
          url: "https://example.com/source-test",
          snippet: "Snippet test",
        },
      ],
      trace: {
        provider: "openai",
        model: "gpt-5.2",
        prompt: "actualité internet valbonne",
        responseText: "Réponse brute provider",
        price: 0.012345,
        inputTokens: 123,
        outputTokens: 45,
        totalTokens: 168,
      },
    });

    try {
      const response = await createApp().fetch(
        new Request("http://localhost/assistant/messages", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: "cherche sur internet les actualités immo à Valbonne",
          }),
        }),
      );
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.assistantMessage.citations.length).toBeGreaterThan(0);
      expect(payload.assistantMessage.text).toContain("Voici ce que j'ai trouvé sur internet");

      const row = await db.query.aiCallLogs.findFirst({
        where: and(eq(aiCallLogs.orgId, orgId), eq(aiCallLogs.useCase, "ASSISTANT_WEB_SEARCH")),
        orderBy: [desc(aiCallLogs.createdAt), desc(aiCallLogs.id)],
      });

      expect(row).toBeDefined();
      expect(row?.prompt).toContain("cherche sur internet les actualités immo à Valbonne");
      expect(row?.responseText).toContain("Voici ce que j'ai trouvé sur internet");
      expect((row?.price ?? 0) > 0).toBe(true);
    } finally {
      assistantWebSearchProvider.search = originalSearch;
    }
  });
});
