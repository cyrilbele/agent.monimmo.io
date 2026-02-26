import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import {
  properties,
  propertyParties,
  propertyTimelineEvents,
} from "../src/db/schema";
import { propertiesService } from "../src/properties/service";

describe("propertiesService", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("crée puis lit un bien", async () => {
    const created = await propertiesService.create({
      orgId: "org_demo",
      title: "Service Bien",
      city: "Marseille",
      postalCode: "13001",
      status: "PROSPECTION",
    });

    expect(created.id).toBeDefined();
    expect(created.orgId).toBe("org_demo");

    const loaded = await propertiesService.getById({
      orgId: "org_demo",
      id: created.id,
    });
    expect(loaded.title).toBe("Service Bien");
  });

  it("pagine la liste des biens", async () => {
    await propertiesService.create({
      orgId: "org_demo",
      title: `Service A ${crypto.randomUUID()}`,
      city: "Paris",
      postalCode: "75001",
      status: "PROSPECTION",
    });
    await Bun.sleep(2);
    await propertiesService.create({
      orgId: "org_demo",
      title: `Service B ${crypto.randomUUID()}`,
      city: "Paris",
      postalCode: "75002",
      status: "PROSPECTION",
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
      status: "PROSPECTION",
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
      status: "PROSPECTION",
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
      status: "PROSPECTION",
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
});
