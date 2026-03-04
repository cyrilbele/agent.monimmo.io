import { eq } from "drizzle-orm";
import { resolveAppAIProvider } from "../ai/factory";
import {
  getGlobalProviderSettings,
  updateGlobalProviderSettings,
} from "../config/provider-settings";
import { db } from "../db/client";
import { organizations, users } from "../db/schema";
import { HttpError } from "../http/errors";
import {
  normalizeValuationAiOutputFormatForPersistence,
  resolveValuationAiOutputFormat,
} from "../config/valuation-ai-output-format";
import { passwordResetStore } from "./password-reset-store";
import { assertOrgScope, assertRoleAllowed } from "./rbac";
import { issueTokenPair, verifyAccessToken, verifyRefreshToken } from "./jwt";
import { refreshTokenStore } from "./refresh-token-store";

type UserRow = typeof users.$inferSelect;
type OrganizationRow = typeof organizations.$inferSelect;

const DEFAULT_NOTARY_FEE_PCT = 8;
const MIN_NOTARY_FEE_PCT = 0;
const MAX_NOTARY_FEE_PCT = 100;
export const DEFAULT_ASSISTANT_SOUL =
  "Tu es Monimmo, un assistant immobilier pragmatique, clair et orienté action pour les agents français.";

const normalizeNotaryFeePct = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_NOTARY_FEE_PCT;
  }

  const clamped = Math.min(Math.max(value, MIN_NOTARY_FEE_PCT), MAX_NOTARY_FEE_PCT);
  return Number(clamped.toFixed(2));
};

const resolveNotaryFeePct = (organization: OrganizationRow | undefined): number => {
  if (!organization) {
    return DEFAULT_NOTARY_FEE_PCT;
  }

  return normalizeNotaryFeePct(organization.notaryFeePct);
};

const normalizeAssistantSoulForPersistence = (value: unknown): string | null => {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveAssistantSoul = (organization: OrganizationRow | undefined): string => {
  const persisted = normalizeAssistantSoulForPersistence(organization?.assistantSoul);
  return persisted ?? DEFAULT_ASSISTANT_SOUL;
};

const getUserEmailForAuth = (user: UserRow): string => {
  if (!user.email) {
    throw new HttpError(
      409,
      "USER_EMAIL_REQUIRED",
      "Cet utilisateur ne peut pas se connecter sans email",
    );
  }

  return user.email;
};

const toUserResponse = (user: UserRow) => ({
  id: user.id,
  email: getUserEmailForAuth(user),
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

const loadOrganizationById = async (id: string): Promise<OrganizationRow | undefined> => {
  return db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
};

const issueAuthTokens = async (user: UserRow) => {
  const email = getUserEmailForAuth(user);

  const tokenPair = await issueTokenPair({
    sub: user.id,
    orgId: user.orgId,
    role: user.role,
    email,
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
      accountType: "AGENT",
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

    if (!user.email) {
      return;
    }

    const ttlMs = 30 * 60 * 1000;
    passwordResetStore.create(user.email, user.id, ttlMs);
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

    refreshTokenStore.revokeAllForUser(userId);
  },

  async me(accessToken: string) {
    const payload = await verifyAccessToken(accessToken);
    assertRoleAllowed(payload.role);
    const user = await loadUserById(payload.sub, payload.orgId);

    return {
      user: toUserResponse(user),
    };
  },

  async getSettings(accessToken: string) {
    const payload = await verifyAccessToken(accessToken);
    assertRoleAllowed(payload.role);
    const user = await loadUserById(payload.sub, payload.orgId);
    const [organization, globalProviderSettings] = await Promise.all([
      loadOrganizationById(user.orgId),
      getGlobalProviderSettings(),
    ]);

    return {
      notaryFeePct: resolveNotaryFeePct(organization),
      aiProvider: globalProviderSettings.aiProvider,
      valuationAiOutputFormat: resolveValuationAiOutputFormat(organization?.valuationAiOutputFormat),
      assistantSoul: resolveAssistantSoul(organization),
    };
  },

  async updateSettings(
    accessToken: string,
    input: {
      notaryFeePct?: number;
      aiProvider?: "openai" | "anthropic";
      valuationAiOutputFormat?: string | null;
      assistantSoul?: string | null;
    },
  ) {
    const payload = await verifyAccessToken(accessToken);
    assertRoleAllowed(payload.role);
    const user = await loadUserById(payload.sub, payload.orgId);
    const organization = await loadOrganizationById(user.orgId);
    const normalizedNotaryFeePct =
      typeof input.notaryFeePct === "number"
        ? normalizeNotaryFeePct(input.notaryFeePct)
        : resolveNotaryFeePct(organization);
    const aiProviderInput =
      typeof input.aiProvider === "string"
        ? resolveAppAIProvider(input.aiProvider)
        : undefined;
    const persistedValuationAiOutputFormat =
      typeof input.valuationAiOutputFormat === "undefined"
        ? organization?.valuationAiOutputFormat ?? null
        : normalizeValuationAiOutputFormatForPersistence(input.valuationAiOutputFormat);
    const persistedAssistantSoul =
      typeof input.assistantSoul === "undefined"
        ? normalizeAssistantSoulForPersistence(organization?.assistantSoul)
        : normalizeAssistantSoulForPersistence(input.assistantSoul);
    const now = new Date();

    await db
      .update(organizations)
      .set({
        notaryFeePct: normalizedNotaryFeePct,
        valuationAiOutputFormat: persistedValuationAiOutputFormat,
        assistantSoul: persistedAssistantSoul,
        updatedAt: now,
      })
      .where(eq(organizations.id, user.orgId));

    const globalProviderSettings = aiProviderInput
      ? await updateGlobalProviderSettings({
          aiProvider: aiProviderInput,
        })
      : await getGlobalProviderSettings();

    const resolvedValuationAiOutputFormat = resolveValuationAiOutputFormat(
      persistedValuationAiOutputFormat,
    );

    return {
      notaryFeePct: normalizedNotaryFeePct,
      aiProvider: globalProviderSettings.aiProvider,
      valuationAiOutputFormat: resolvedValuationAiOutputFormat,
      assistantSoul: persistedAssistantSoul ?? DEFAULT_ASSISTANT_SOUL,
    };
  },
};
