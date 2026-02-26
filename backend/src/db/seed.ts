import { eq } from "drizzle-orm";
import { db } from "./client";
import { organizations, properties, users } from "./schema";

const now = new Date();

const seed = async () => {
  const orgId = "org_demo";
  const userId = "user_demo";
  const propertyId = "property_demo";

  const existingOrg = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!existingOrg) {
    await db.insert(organizations).values({
      id: orgId,
      name: "Agence Démo Monimmo",
      createdAt: now,
      updatedAt: now,
    });
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!existingUser) {
    await db.insert(users).values({
      id: userId,
      orgId,
      email: "agent.demo@monimmo.fr",
      firstName: "Camille",
      lastName: "Martin",
      role: "AGENT",
      passwordHash: "not-set-yet",
      createdAt: now,
      updatedAt: now,
    });
  }

  const existingProperty = await db.query.properties.findFirst({
    where: eq(properties.id, propertyId),
  });

  if (!existingProperty) {
    await db.insert(properties).values({
      id: propertyId,
      orgId,
      title: "Appartement T3 lumineux",
      city: "Lyon",
      postalCode: "69003",
      address: "42 rue de la République",
      price: 349000,
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });
  }

  console.info("Seed minimal appliqué.");
};

await seed();

