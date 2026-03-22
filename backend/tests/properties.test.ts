import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import {
  businessLinks,
  files,
  organizations,
  properties,
  propertyTimelineEvents,
  propertyVisits,
} from "../src/db/schema";
import { createApp } from "../src/server";

const loginAndGetAccessToken = async (): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: DEMO_AUTH_EMAIL,
        password: DEMO_AUTH_PASSWORD,
      }),
    }),
  );

  const payload = await response.json();
  return payload.accessToken as string;
};

const ownerPayload = () => ({
  firstName: "Lucie",
  lastName: "Moreau",
  phone: "0611223344",
  email: `owner.${crypto.randomUUID()}@monimmo.fr`,
});

const toJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const ensureOrganization = async (orgId: string): Promise<void> => {
  const now = new Date();
  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: `Organisation ${orgId}`,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: organizations.id });
};

describe("properties endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("crée un bien sans liaison utilisateur automatique et force le statut PROSPECTION", async () => {
    const token = await loginAndGetAccessToken();
    const response = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Maison de ville",
          city: "Bordeaux",
          postalCode: "33000",
          address: "10 rue du Port",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.title).toBe("Maison de ville");
    expect(payload.orgId).toBe("org_demo");
    expect(payload.status).toBe("PROSPECTION");
    expect(payload.hiddenExpectedDocumentKeys).toEqual([]);

    const links = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, "org_demo"),
          eq(businessLinks.typeLien, "bien_user"),
          eq(businessLinks.objectId1, payload.id),
        ),
      );
    expect(links).toHaveLength(0);
  });

  it("accepte limit=300 sur l'historique object-changes d'un bien", async () => {
    const token = await loginAndGetAccessToken();
    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Historique ${crypto.randomUUID()}`,
          city: "Nice",
          postalCode: "06000",
          address: "5 avenue Jean Médecin",
        }),
      }),
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const objectChangesResponse = await createApp().fetch(
      new Request(
        `http://localhost/object-changes/bien/${encodeURIComponent(created.id as string)}?limit=300`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      ),
    );

    expect(objectChangesResponse.status).toBe(200);
    const payload = await objectChangesResponse.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
  });

  it("liste les biens avec pagination cursor", async () => {
    const token = await loginAndGetAccessToken();

    await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien A ${crypto.randomUUID()}`,
          city: "Lyon",
          postalCode: "69001",
          address: "1 quai Jules Courmont",
          owner: ownerPayload(),
        }),
      }),
    );
    await Bun.sleep(2);

    await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien B ${crypto.randomUUID()}`,
          city: "Lyon",
          postalCode: "69002",
          address: "12 rue de Brest",
          owner: ownerPayload(),
        }),
      }),
    );
    await Bun.sleep(2);

    await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien C ${crypto.randomUUID()}`,
          city: "Lyon",
          postalCode: "69003",
          address: "3 rue Paul Bert",
          owner: ownerPayload(),
        }),
      }),
    );

    const page1 = await createApp().fetch(
      new Request("http://localhost/properties?limit=2", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(page1.status).toBe(200);
    const page1Payload = await page1.json();
    expect(page1Payload.items.length).toBe(2);
    expect(typeof page1Payload.nextCursor).toBe("string");

    const page2 = await createApp().fetch(
      new Request(`http://localhost/properties?limit=2&cursor=${page1Payload.nextCursor}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(page2.status).toBe(200);
    const page2Payload = await page2.json();
    expect(page2Payload.items.length).toBeGreaterThan(0);
  });

  it("filtre les biens avec le paramètre q", async () => {
    const token = await loginAndGetAccessToken();
    const marker = crypto.randomUUID();

    const matchingCreateResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Recherche ${marker}`,
          city: "Montpellier",
          postalCode: "34000",
          address: "2 place de la Comédie",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(matchingCreateResponse.status).toBe(201);
    const matchingProperty = await matchingCreateResponse.json();

    const otherCreateResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Sans rapport ${crypto.randomUUID()}`,
          city: "Nîmes",
          postalCode: "30000",
          address: "1 boulevard Victor-Hugo",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(otherCreateResponse.status).toBe(201);
    const otherProperty = await otherCreateResponse.json();

    const searchResponse = await createApp().fetch(
      new Request(`http://localhost/properties?limit=100&q=${encodeURIComponent(marker)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(searchResponse.status).toBe(200);
    const searchPayload = await searchResponse.json();
    expect(
      searchPayload.items.some((item: { id: string }) => item.id === matchingProperty.id),
    ).toBe(true);
    expect(
      searchPayload.items.some((item: { id: string }) => item.id === otherProperty.id),
    ).toBe(false);
  }, 15000);

  it("n'expose pas en recherche les biens indexes d'une autre organisation", async () => {
    const token = await loginAndGetAccessToken();
    const marker = `cross-org-${crypto.randomUUID()}`;
    const otherOrgId = `org_other_${crypto.randomUUID()}`;
    const now = new Date();

    await ensureOrganization(otherOrgId);
    await db.insert(properties).values({
      id: crypto.randomUUID(),
      orgId: otherOrgId,
      title: `Bien externe ${marker}`,
      city: "Toulouse",
      postalCode: "31000",
      address: "1 allée Jean Jaurès",
      price: 350000,
      details: "{}",
      hiddenExpectedDocumentKeys: "[]",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    const response = await createApp().fetch(
      new Request(`http://localhost/properties?limit=100&q=${encodeURIComponent(marker)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(
      payload.items.some((item: { title: string }) =>
        String(item.title).toLowerCase().includes(marker.toLowerCase()),
      ),
    ).toBe(false);
  });

  it("lit et met à jour un bien", async () => {
    const token = await loginAndGetAccessToken();
    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien à modifier",
          city: "Nantes",
          postalCode: "44000",
          address: "9 allée Flesselles",
          owner: ownerPayload(),
        }),
      }),
    );
    const created = await createResponse.json();

    const getResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(getResponse.status).toBe(200);

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien modifié",
          city: "Rennes",
          address: "11 rue Le Bastard",
          hiddenExpectedDocumentKeys: ["mandat::MANDAT_VENTE_SIGNE", "technique::AMIANTE"],
        }),
      }),
    );

    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.title).toBe("Bien modifié");
    expect(patched.city).toBe("Rennes");
    expect(patched.hiddenExpectedDocumentKeys).toEqual([
      "mandat::MANDAT_VENTE_SIGNE",
      "technique::AMIANTE",
    ]);

    const dbProperty = await db.query.properties.findFirst({
      where: eq(properties.id, created.id),
    });
    expect(dbProperty).not.toBeUndefined();
    expect(
      JSON.parse(dbProperty?.hiddenExpectedDocumentKeys ?? "[]"),
    ).toEqual(["mandat::MANDAT_VENTE_SIGNE", "technique::AMIANTE"]);
  });

  it("met à jour le statut et crée un événement timeline", async () => {
    const token = await loginAndGetAccessToken();
    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien statut",
          city: "Lille",
          postalCode: "59000",
          address: "4 rue Faidherbe",
          owner: ownerPayload(),
        }),
      }),
    );
    const created = await createResponse.json();

    const statusResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "MANDAT_SIGNE",
        }),
      }),
    );

    expect(statusResponse.status).toBe(200);
    const statusPayload = await statusResponse.json();
    expect(statusPayload.status).toBe("MANDAT_SIGNE");

    const dbProperty = await db.query.properties.findFirst({
      where: eq(properties.id, created.id),
    });
    expect(dbProperty?.status).toBe("MANDAT_SIGNE");

    const timelineEvent = await db.query.propertyTimelineEvents.findFirst({
      where: and(
        eq(propertyTimelineEvents.propertyId, created.id),
        eq(propertyTimelineEvents.eventType, "PROPERTY_STATUS_CHANGED"),
      ),
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    expect(timelineEvent).not.toBeNull();
    expect(timelineEvent?.payload).toContain("\"from\":\"PROSPECTION\"");
    expect(timelineEvent?.payload).toContain("\"to\":\"MANDAT_SIGNE\"");
  });

  it("retourne 401 sans token", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("n'expose plus l'endpoint legacy participants", async () => {
    const token = await loginAndGetAccessToken();

    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien participant",
          city: "Nice",
          postalCode: "06000",
          address: "18 avenue Jean Médecin",
          owner: ownerPayload(),
        }),
      }),
    );
    const created = await createResponse.json();

    const participantResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}/participants`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactId: "contact_123",
          role: "VENDEUR",
        }),
      }),
    );

    expect(participantResponse.status).toBe(404);
  });

  it("cree un bien sans creer de lien automatique meme avec ownerUserId", async () => {
    const token = await loginAndGetAccessToken();
    const clientEmail = `client.owner.${crypto.randomUUID()}@monimmo.fr`;

    const createClientResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: "Nora",
          lastName: "Client",
          email: clientEmail,
          phone: "0601020304",
          accountType: "CLIENT",
        }),
      }),
    );
    expect(createClientResponse.status).toBe(201);
    const clientPayload = await createClientResponse.json();

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien owner existant",
          city: "Toulouse",
          postalCode: "31000",
          address: "12 allee Jean Jaures",
          ownerUserId: clientPayload.id,
        }),
      }),
    );

    expect(createPropertyResponse.status).toBe(201);
    const propertyPayload = await createPropertyResponse.json();

    const ownerLink = await db.query.businessLinks.findFirst({
      where: and(
        eq(businessLinks.orgId, "org_demo"),
        eq(businessLinks.typeLien, "bien_user"),
        eq(businessLinks.objectId1, propertyPayload.id),
        eq(businessLinks.objectId2, clientPayload.id),
      ),
    });
    expect(ownerLink).toBeUndefined();
  });

  it("ajoute et liste les utilisateurs liés d'un bien via /links", async () => {
    const token = await loginAndGetAccessToken();

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien prospects",
          city: "Marseille",
          postalCode: "13001",
          address: "8 rue de la Republique",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const propertyPayload = await createPropertyResponse.json();

    const createUserResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: "Paul",
          lastName: "Prospect",
          phone: "0605040302",
          email: `prospect.${crypto.randomUUID()}@monimmo.fr`,
          accountType: "CLIENT",
        }),
      }),
    );
    expect(createUserResponse.status).toBe(201);
    const createdUser = await createUserResponse.json();

    const createLinkResponse = await createApp().fetch(
      new Request("http://localhost/links", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeLien: "bien_user",
          objectId1: propertyPayload.id,
          objectId2: createdUser.id,
          params: {
            relationRole: "OWNER",
          },
        }),
      }),
    );
    expect(createLinkResponse.status).toBe(201);
    const createdLink = await createLinkResponse.json();
    expect(createdLink.typeLien).toBe("bien_user");

    const relatedResponse = await createApp().fetch(
      new Request(`http://localhost/links/related/bien/${propertyPayload.id}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(relatedResponse.status).toBe(200);
    const relatedPayload = await relatedResponse.json();
    expect(Array.isArray(relatedPayload.items)).toBe(true);
    expect(Array.isArray(relatedPayload.grouped?.user)).toBe(true);
    expect(
      relatedPayload.items.some(
        (item: {
          link: { objectId2: string; params?: Record<string, unknown> };
          otherSideObjectType: string;
        }) =>
          item.otherSideObjectType === "user" &&
          item.link.objectId2 === createdUser.id &&
          item.link.params?.relationRole === "OWNER",
      ),
    ).toBe(true);
  });

  it("ajoute et liste les visites d'un bien puis les expose dans le calendrier global", async () => {
    const token = await loginAndGetAccessToken();

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien visites",
          city: "Paris",
          postalCode: "75011",
          address: "15 rue Oberkampf",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const propertyPayload = await createPropertyResponse.json();

    const createUserResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: "Julie",
          lastName: "Visite",
          phone: "0600000001",
          email: `visite.${crypto.randomUUID()}@monimmo.fr`,
          accountType: "CLIENT",
        }),
      }),
    );
    expect(createUserResponse.status).toBe(201);
    const prospectPayload = await createUserResponse.json();

    const startsAt = "2026-03-10T09:30:00.000Z";
    const endsAt = "2026-03-10T10:15:00.000Z";

    const addVisitResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${propertyPayload.id}/visits`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prospectUserId: prospectPayload.id,
          startsAt,
          endsAt,
        }),
      }),
    );
    expect(addVisitResponse.status).toBe(201);
    const visitPayload = await addVisitResponse.json();
    expect(visitPayload.propertyId).toBe(propertyPayload.id);
    expect(visitPayload.prospectUserId).toBe(prospectPayload.id);
    expect(visitPayload.startsAt).toBe(startsAt);
    expect(visitPayload.endsAt).toBe(endsAt);
    expect(visitPayload.compteRendu).toBeNull();
    expect(visitPayload.bonDeVisiteFileId).toBeNull();
    expect(visitPayload.bonDeVisiteFileName).toBeNull();

    const rdvBienLinks = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, "org_demo"),
          eq(businessLinks.typeLien, "rdv_bien"),
          eq(businessLinks.objectId1, visitPayload.id),
          eq(businessLinks.objectId2, propertyPayload.id),
        ),
      );
    expect(rdvBienLinks).toHaveLength(1);

    const rdvUserLinks = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, "org_demo"),
          eq(businessLinks.typeLien, "rdv_user"),
          eq(businessLinks.objectId1, visitPayload.id),
          eq(businessLinks.objectId2, prospectPayload.id),
        ),
      );
    expect(rdvUserLinks).toHaveLength(1);

    const relatedLinksResponse = await createApp().fetch(
      new Request(`http://localhost/links/related/bien/${propertyPayload.id}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(relatedLinksResponse.status).toBe(200);
    const relatedLinksPayload = await relatedLinksResponse.json();
    expect(Array.isArray(relatedLinksPayload.grouped.rdv)).toBe(true);
    expect(relatedLinksPayload.grouped.visite).toBeUndefined();
    expect(
      relatedLinksPayload.grouped.rdv.some((item: { id: string }) => item.id === visitPayload.id),
    ).toBe(true);

    const visitChangesResponse = await createApp().fetch(
      new Request(`http://localhost/object-changes/rdv/${encodeURIComponent(visitPayload.id)}?limit=300`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(visitChangesResponse.status).toBe(200);
    const visitChangesPayload = await visitChangesResponse.json();
    expect(Array.isArray(visitChangesPayload.items)).toBe(true);
    expect(
      visitChangesPayload.items.some(
        (change: { objectType: string; objectId: string }) =>
          change.objectType === "rdv" && change.objectId === visitPayload.id,
      ),
    ).toBe(true);

    const listVisitsResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${propertyPayload.id}/visits`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(listVisitsResponse.status).toBe(200);
    const listVisitsPayload = await listVisitsResponse.json();
    expect(
      listVisitsPayload.items.some((item: { id: string }) => item.id === visitPayload.id),
    ).toBe(true);

    const calendarResponse = await createApp().fetch(
      new Request(
        "http://localhost/visits?from=2026-03-10T00:00:00.000Z&to=2026-03-11T00:00:00.000Z",
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      ),
    );
    expect(calendarResponse.status).toBe(200);
    const calendarPayload = await calendarResponse.json();
    expect(
      calendarPayload.items.some((item: { id: string }) => item.id === visitPayload.id),
    ).toBe(true);

    const getVisitByIdResponse = await createApp().fetch(
      new Request(`http://localhost/visits/${visitPayload.id}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(getVisitByIdResponse.status).toBe(200);
    const fetchedVisit = await getVisitByIdResponse.json();
    expect(fetchedVisit.id).toBe(visitPayload.id);
    expect(fetchedVisit.compteRendu).toBeNull();
    expect(fetchedVisit.bonDeVisiteFileId).toBeNull();

    const uploadBonResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: propertyPayload.id,
          fileName: "bon-visite.pdf",
          mimeType: "application/pdf",
          size: Buffer.from("bon visite").byteLength,
          contentBase64: Buffer.from("bon visite").toString("base64"),
        }),
      }),
    );
    expect(uploadBonResponse.status).toBe(201);
    const uploadedBon = await uploadBonResponse.json();

    const patchVisitResponse = await createApp().fetch(
      new Request(`http://localhost/visits/${visitPayload.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          compteRendu: "Prospect interesse, deuxieme visite proposee.",
          bonDeVisiteFileId: uploadedBon.id,
        }),
      }),
    );
    expect(patchVisitResponse.status).toBe(200);
    const patchedVisit = await patchVisitResponse.json();
    expect(patchedVisit.compteRendu).toBe("Prospect interesse, deuxieme visite proposee.");
    expect(patchedVisit.bonDeVisiteFileId).toBe(uploadedBon.id);
    expect(patchedVisit.bonDeVisiteFileName).toBe("bon-visite.pdf");

    const dbVisit = await db.query.propertyVisits.findFirst({
      where: and(
        eq(propertyVisits.id, visitPayload.id),
        eq(propertyVisits.propertyId, propertyPayload.id),
      ),
    });
    expect(dbVisit).not.toBeNull();
    expect(dbVisit?.compteRendu).toBe("Prospect interesse, deuxieme visite proposee.");
    expect(dbVisit?.bonDeVisiteFileId).toBe(uploadedBon.id);

    const linkedFile = await db.query.files.findFirst({
      where: and(
        eq(files.id, uploadedBon.id),
        eq(files.propertyId, propertyPayload.id),
      ),
    });
    expect(linkedFile).not.toBeNull();
  });

  it("planifie une visite avec un client non lié sans créer de lien implicite", async () => {
    const token = await loginAndGetAccessToken();

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien visite auto-prospect",
          city: "Toulouse",
          postalCode: "31000",
          address: "22 rue Alsace Lorraine",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const propertyPayload = await createPropertyResponse.json();

    const createClientResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: "Client",
          lastName: "Direct",
          phone: "0609090909",
          email: `client.direct.${crypto.randomUUID()}@monimmo.fr`,
          accountType: "CLIENT",
        }),
      }),
    );
    expect(createClientResponse.status).toBe(201);
    const clientPayload = await createClientResponse.json();

    const addVisitResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${propertyPayload.id}/visits`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prospectUserId: clientPayload.id,
          startsAt: "2026-03-12T14:00:00.000Z",
          endsAt: "2026-03-12T15:00:00.000Z",
        }),
      }),
    );
    expect(addVisitResponse.status).toBe(201);

    const autoLink = await db.query.businessLinks.findFirst({
      where: and(
        eq(businessLinks.orgId, "org_demo"),
        eq(businessLinks.typeLien, "bien_user"),
        eq(businessLinks.objectId1, propertyPayload.id),
        eq(businessLinks.objectId2, clientPayload.id),
      ),
    });

    expect(autoLink).toBeUndefined();
  });

  it("retourne les risques georisques d'un bien", async () => {
    const token = await loginAndGetAccessToken();
    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien risques",
          city: "Nice",
          postalCode: "06000",
          address: "12 avenue de Verdun",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const propertyPayload = await createPropertyResponse.json();

    const previousFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("https://geo.api.gouv.fr/communes")) {
          return toJsonResponse([{ nom: "Nice", code: "06088" }]);
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const risksResponse = await createApp().fetch(
        new Request(`http://localhost/properties/${propertyPayload.id}/risks`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      );

      expect(risksResponse.status).toBe(200);
      const payload = await risksResponse.json();
      expect(payload.status).toBe("NO_DATA");
      expect(payload.source).toBe("GEORISQUES");
      expect(payload.location.city).toBe("Nice");
      expect(payload.location.inseeCode).toBe("06088");
      expect(payload.georisquesUrl).toContain(
        "/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2",
      );
      expect(payload.georisquesUrl).toContain("city=Nice");
      expect(payload.georisquesUrl).toContain("codeInsee=06088");
      expect(payload.items).toEqual([]);
      expect(typeof payload.message).toBe("string");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("retourne NO_DATA meme si la resolution INSEE ne repond pas", async () => {
    const token = await loginAndGetAccessToken();
    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien risques indisponibles",
          city: "Lyon",
          postalCode: "69003",
          address: "20 rue Servient",
          owner: ownerPayload(),
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const propertyPayload = await createPropertyResponse.json();

    const previousFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => {
        throw new Error("network_down");
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const response = await createApp().fetch(
        new Request(`http://localhost/properties/${propertyPayload.id}/risks`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.status).toBe("NO_DATA");
      expect(payload.items).toEqual([]);
      expect(typeof payload.message).toBe("string");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("retourne 404 sur un bien inexistant", async () => {
    const token = await loginAndGetAccessToken();
    const response = await createApp().fetch(
      new Request("http://localhost/properties/inconnu", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "PROPERTY_NOT_FOUND",
      message: "Bien introuvable",
    });
  });
});
