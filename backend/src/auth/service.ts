import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { organizations, users } from "../db/schema";
import { HttpError } from "../http/errors";
import { passwordResetStore } from "./password-reset-store";
import { assertOrgScope, assertRoleAllowed } from "./rbac";
import { issueTokenPair, verifyAccessToken, verifyRefreshToken } from "./jwt";
import { refreshTokenStore } from "./refresh-token-store";

type UserRow = typeof users.$inferSelect;

const toUserResponse = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  orgId: user.orgId,
  role: user.role as "AGENT" | "MANAGER" | "ADMIN",
  createdAt: user.createdAt.toISOString(),
});

const loadUserById = async (id: string, expectedOrgId?: string): Promise<UserRow> => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "Utilisateur introuvable");
  }

  if (expectedOrgId) {
    assertOrgScope(expectedOrgId, user.orgId);
  }

  return user;
};

const issueAuthTokens = async (user: UserRow) => {
  const tokenPair = await issueTokenPair({
    sub: user.id,
    orgId: user.orgId,
    role: user.role,
    email: user.email,
  });

  refreshTokenStore.save(tokenPair.refreshJti, user.id, tokenPair.refreshExpiresAt);

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    expiresIn: tokenPair.expiresIn,
  };
};

export const authService = {
  async login(input: { email: string; password: string }) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Identifiants invalides");
    }

    const passwordOk = await Bun.password.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Identifiants invalides");
    }

    const tokenPair = await issueAuthTokens(user);

    return {
      ...tokenPair,
      user: toUserResponse(user),
    };
  },

  async register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (existingUser) {
      throw new HttpError(409, "EMAIL_ALREADY_USED", "Cet email est déjà utilisé");
    }

    const now = new Date();
    const orgId = `org_${crypto.randomUUID()}`;
    await db.insert(organizations).values({
      id: orgId,
      name: `Organisation ${input.firstName} ${input.lastName}`.trim(),
      createdAt: now,
      updatedAt: now,
    });

    const userId = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(input.password);

    await db.insert(users).values({
      id: userId,
      orgId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: "AGENT",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const createdUser = await loadUserById(userId);
    const tokenPair = await issueAuthTokens(createdUser);

    return {
      ...tokenPair,
      user: toUserResponse(createdUser),
    };
  },

  async refresh(input: { refreshToken: string }) {
    const payload = await verifyRefreshToken(input.refreshToken);
    const jti = payload.jti;

    if (!jti || !refreshTokenStore.isValid(jti, payload.sub)) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token invalide");
    }

    refreshTokenStore.revoke(jti);
    const user = await loadUserById(payload.sub, payload.orgId);

    const tokenPair = await issueAuthTokens(user);

    return {
      ...tokenPair,
    };
  },

  async logout(input: { refreshToken: string }) {
    const payload = await verifyRefreshToken(input.refreshToken);

    if (!payload.jti) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token invalide");
    }

    await loadUserById(payload.sub, payload.orgId);
    refreshTokenStore.revoke(payload.jti);
  },

  async forgotPassword(input: { email: string }) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user) {
      return;
    }

    const ttlMs = 30 * 60 * 1000;
    const token = passwordResetStore.create(user.email, user.id, ttlMs);

    console.info(`Reset token généré pour ${user.email}: ${token}`);
  },

  async resetPassword(input: { token: string; newPassword: string }) {
    const userId = passwordResetStore.consume(input.token);

    if (!userId) {
      throw new HttpError(400, "INVALID_RESET_TOKEN", "Token de réinitialisation invalide");
    }

    const passwordHash = await Bun.password.hash(input.newPassword);

    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  },

  async me(accessToken: string) {
    const payload = await verifyAccessToken(accessToken);
    assertRoleAllowed(payload.role);
    const user = await loadUserById(payload.sub, payload.orgId);

    return {
      user: toUserResponse(user),
    };
  },
};
