import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { HttpError } from "../http/errors";

type TokenType = "access" | "refresh";

type UserTokenClaims = {
  sub: string;
  orgId: string;
  role: string;
  email: string;
};

type JwtPayload = UserTokenClaims & {
  type: TokenType;
  jti?: string;
  exp: number;
};

const ACCESS_EXPIRES_IN_SECONDS = 15 * 60;
const REFRESH_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;

const textEncoder = new TextEncoder();
const ephemeralFallbackSecret = randomBytes(32).toString("hex");
const warnedMissingSecrets = new Set<string>();

const resolveJwtSecret = (name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): Uint8Array => {
  const configured = process.env[name]?.trim();
  if (configured) {
    return textEncoder.encode(configured);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} manquant en production`);
  }

  if (!warnedMissingSecrets.has(name)) {
    warnedMissingSecrets.add(name);
    console.warn(
      `[Security] ${name} absent: secret ephemere en cours d'utilisation (dev/test uniquement).`,
    );
  }

  return textEncoder.encode(`${name}:${ephemeralFallbackSecret}`);
};

const accessSecret = resolveJwtSecret("JWT_ACCESS_SECRET");
const refreshSecret = resolveJwtSecret("JWT_REFRESH_SECRET");

const signToken = async (
  claims: UserTokenClaims,
  type: TokenType,
  expiresInSeconds: number,
  jti?: string,
): Promise<string> => {
  const jwt = new SignJWT({
    orgId: claims.orgId,
    role: claims.role,
    email: claims.email,
    type,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`);

  if (jti) {
    jwt.setJti(jti);
  }

  return jwt.sign(type === "access" ? accessSecret : refreshSecret);
};

export const issueTokenPair = async (claims: UserTokenClaims) => {
  const refreshJti = crypto.randomUUID();
  const accessToken = await signToken(claims, "access", ACCESS_EXPIRES_IN_SECONDS);
  const refreshToken = await signToken(
    claims,
    "refresh",
    REFRESH_EXPIRES_IN_SECONDS,
    refreshJti,
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_EXPIRES_IN_SECONDS,
    refreshJti,
    refreshExpiresAt: new Date(Date.now() + REFRESH_EXPIRES_IN_SECONDS * 1000),
  };
};

const verifyToken = async (
  token: string,
  expectedType: TokenType,
): Promise<JwtPayload> => {
  try {
    const verified = await jwtVerify(token, expectedType === "access" ? accessSecret : refreshSecret);
    const payload = verified.payload as Partial<JwtPayload>;

    if (payload.type !== expectedType || !payload.sub || !payload.orgId || !payload.role || !payload.email) {
      throw new HttpError(401, "INVALID_TOKEN", "Token invalide");
    }

    if (!payload.exp) {
      throw new HttpError(401, "INVALID_TOKEN", "Token invalide");
    }

    return {
      sub: payload.sub,
      orgId: payload.orgId,
      role: payload.role,
      email: payload.email,
      type: payload.type,
      jti: payload.jti,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, "INVALID_TOKEN", "Token invalide");
  }
};

export const verifyAccessToken = async (token: string): Promise<JwtPayload> =>
  verifyToken(token, "access");

export const verifyRefreshToken = async (token: string): Promise<JwtPayload> =>
  verifyToken(token, "refresh");
