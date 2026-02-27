import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import {
  properties,
  propertyParties,
  propertyTimelineEvents,
  propertyUserLinks,
  users,
} from "../src/db/schema";
import { propertiesService } from "../src/properties/service";

const ownerPayload = () => ({
  firstName: "Louise",
  lastName: "Bernard",
  phone: "0601020304",
  email: `proprietaire.${crypto.randomUUID()}@monimmo.fr`,
});

const toJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

describe("propertiesService", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("crée puis lit un bien avec création du compte propriétaire lié", async () => {
    const owner = ownerPayload();
    const created = await propertiesService.create({
      orgId: "org_demo",
      title: "Service Bien",
      city: "Marseille",
      postalCode: "13001",
      address: "15 rue Saint-Ferréol",
      owner,
    });

    expect(created.id).toBeDefined();
    expect(created.orgId).toBe("org_demo");
    expect(created.status).toBe("PROSPECTION");

    const loaded = await propertiesService.getById({
      orgId: "org_demo",
      id: created.id,
    });
    expect(loaded.title).toBe("Service Bien");

    const ownerUser = await db.query.users.findFirst({
      where: eq(users.email, owner.email.toLowerCase()),
    });
    expect(ownerUser?.firstName).toBe(owner.firstName);
    expect(ownerUser?.phone).toBe(owner.phone);

    const ownerLink = await db.query.propertyUserLinks.findFirst({
      where: and(
        eq(propertyUserLinks.propertyId, created.id),
        eq(propertyUserLinks.userId, ownerUser?.id ?? ""),
      ),
    });
    expect(ownerLink?.role).toBe("OWNER");
  });

  it("pagine la liste des biens", async () => {
    await propertiesService.create({
      orgId: "org_demo",
      title: `Service A ${crypto.randomUUID()}`,
      city: "Paris",
      postalCode: "75001",
      address: "10 rue de Rivoli",
      owner: ownerPayload(),
    });
    await Bun.sleep(2);
    await propertiesService.create({
      orgId: "org_demo",
      title: `Service B ${crypto.randomUUID()}`,
      city: "Paris",
      postalCode: "75002",
      address: "2 place Vendôme",
      owner: ownerPayload(),
    });

    const firstPage = await propertiesService.list({
      orgId: "org_demo",
      limit: 1,
    });
    expect(firstPage.items.length).toBe(1);
    expect(typeof firstPage.nextCursor).toBe("string");

    const secondPage = await propertiesService.list({
      orgId: "org_demo",
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.length).toBe(1);
  });

  it("met à jour un bien et son statut avec event timeline", async () => {
    const created = await propertiesService.create({
      orgId: "org_demo",
      title: "Service Patch",
      city: "Tours",
      postalCode: "37000",
      address: "4 place Plumereau",
      owner: ownerPayload(),
    });

    const patched = await propertiesService.patchById({
      orgId: "org_demo",
      id: created.id,
      data: {
        title: "Service Patch Modifié",
      },
    });
    expect(patched.title).toBe("Service Patch Modifié");

    const statusUpdated = await propertiesService.updateStatus({
      orgId: "org_demo",
      id: created.id,
      status: "MANDAT_SIGNE",
    });
    expect(statusUpdated.status).toBe("MANDAT_SIGNE");

    const timeline = await db.query.propertyTimelineEvents.findFirst({
      where: and(
        eq(propertyTimelineEvents.propertyId, created.id),
        eq(propertyTimelineEvents.eventType, "PROPERTY_STATUS_CHANGED"),
      ),
    });
    expect(timeline).not.toBeNull();
  });

  it("ajoute un participant à un bien", async () => {
    const created = await propertiesService.create({
      orgId: "org_demo",
      title: "Service Participant",
      city: "Reims",
      postalCode: "51100",
      address: "8 boulevard Lundy",
      owner: ownerPayload(),
    });

    const participant = await propertiesService.addParticipant({
      orgId: "org_demo",
      propertyId: created.id,
      contactId: "contact-service-1",
      role: "VENDEUR",
    });

    expect(participant.propertyId).toBe(created.id);
    expect(participant.contactId).toBe("contact-service-1");

    const inDb = await db.query.propertyParties.findFirst({
      where: and(
        eq(propertyParties.propertyId, created.id),
        eq(propertyParties.contactId, "contact-service-1"),
      ),
    });
    expect(inDb).not.toBeNull();
  });

  it("renvoie une erreur si bien hors scope org", async () => {
    const created = await propertiesService.create({
      orgId: "org_demo",
      title: "Scope Test",
      city: "Dijon",
      postalCode: "21000",
      address: "5 rue de la Liberté",
      owner: ownerPayload(),
    });

    const missing = await db.query.properties.findFirst({
      where: and(eq(properties.id, created.id), eq(properties.orgId, "org_other")),
    });
    expect(missing).toBeUndefined();

    await expect(
      propertiesService.getById({
        orgId: "org_other",
        id: created.id,
      }),
    ).rejects.toMatchObject({
      code: "PROPERTY_NOT_FOUND",
    });
  });

  it("géocode automatiquement les coordonnées GPS à la création", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("https://data.geopf.fr/geocodage/search")) {
          return toJsonResponse({
            features: [
              {
                geometry: {
                  coordinates: [2.3522, 48.8566],
                },
              },
            ],
          });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const created = await propertiesService.create({
        orgId: "org_demo",
        title: "Bien geocode",
        city: "Paris",
        postalCode: "75011",
        address: "12 rue Oberkampf",
        owner: ownerPayload(),
      });

      const details = created.details as Record<string, unknown>;
      const location = details.location as Record<string, unknown>;
      expect(location.gpsLat).toBe(48.8566);
      expect(location.gpsLng).toBe(2.3522);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("recalcule les coordonnées GPS quand adresse/ville/code postal changent", async () => {
    let geocodingCalls = 0;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("https://data.geopf.fr/geocodage/search")) {
          geocodingCalls += 1;

          if (geocodingCalls === 1) {
            return toJsonResponse({
              features: [
                {
                  geometry: {
                    coordinates: [4.8357, 45.764],
                  },
                },
              ],
            });
          }

          return toJsonResponse({
            features: [
              {
                geometry: {
                  coordinates: [2.3522, 48.8566],
                },
              },
            ],
          });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const created = await propertiesService.create({
        orgId: "org_demo",
        title: "Bien geocode patch",
        city: "Lyon",
        postalCode: "69003",
        address: "10 rue Servient",
        owner: ownerPayload(),
      });

      const patched = await propertiesService.patchById({
        orgId: "org_demo",
        id: created.id,
        data: {
          city: "Paris",
          postalCode: "75011",
          address: "12 rue Oberkampf",
        },
      });

      const details = patched.details as Record<string, unknown>;
      const location = details.location as Record<string, unknown>;
      expect(location.gpsLat).toBe(48.8566);
      expect(location.gpsLng).toBe(2.3522);
      expect(geocodingCalls).toBe(2);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
