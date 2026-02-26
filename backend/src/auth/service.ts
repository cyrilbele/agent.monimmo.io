import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { HttpError } from "../http/errors";
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

const loadUserById = async (id: string): Promise<UserRow> => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "Utilisateur introuvable");
  }

  return user;
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
      user: toUserResponse(user),
    };
  },

  async refresh(input: { refreshToken: string }) {
    const payload = await verifyRefreshToken(input.refreshToken);
    const jti = payload.jti;

    if (!jti || !refreshTokenStore.isValid(jti, payload.sub)) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token invalide");
    }

    refreshTokenStore.revoke(jti);
    const user = await loadUserById(payload.sub);

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
  },

  async logout(input: { refreshToken: string }) {
    const payload = await verifyRefreshToken(input.refreshToken);

    if (!payload.jti) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token invalide");
    }

    refreshTokenStore.revoke(payload.jti);
  },

  async me(accessToken: string) {
    const payload = await verifyAccessToken(accessToken);
    const user = await loadUserById(payload.sub);

    return {
      user: toUserResponse(user),
    };
  },
};

