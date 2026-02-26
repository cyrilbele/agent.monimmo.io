import { eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../auth/constants";
import { db } from "./client";
import { organizations, properties, users } from "./schema";

export const runSeed = async () => {
  const now = new Date();
  const passwordHash = await Bun.password.hash(DEMO_AUTH_PASSWORD);
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
      email: DEMO_AUTH_EMAIL,
      firstName: "Camille",
      lastName: "Martin",
      role: "AGENT",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(users)
      .set({
        email: DEMO_AUTH_EMAIL,
        firstName: "Camille",
        lastName: "Martin",
        role: "AGENT",
        passwordHash,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
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

if (import.meta.main) {
  await runSeed();
}
