import { HttpError } from "../http/errors";

type AuthRateLimitAction = "login" | "forgot-password" | "reset-password";
type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

type RateLimitPolicy = {
  maxRequests: number;
  windowMs: number;
};

const DEFAULT_POLICIES: Record<AuthRateLimitAction, RateLimitPolicy> = {
  login: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
  },
  "forgot-password": {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  },
  "reset-password": {
    maxRequests: 8,
    windowMs: 15 * 60 * 1000,
  },
};

const rateLimitEntries = new Map<string, RateLimitEntry>();

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
};

const resolvePolicy = (
  action: AuthRateLimitAction,
  env: Record<string, string | undefined> = process.env,
): RateLimitPolicy => {
  const defaults = DEFAULT_POLICIES[action];

  if (action === "login") {
    return {
      maxRequests: toPositiveInt(env.AUTH_RATE_LIMIT_LOGIN_MAX, defaults.maxRequests),
      windowMs: toPositiveInt(env.AUTH_RATE_LIMIT_LOGIN_WINDOW_MS, defaults.windowMs),
    };
  }

  if (action === "forgot-password") {
    return {
      maxRequests: toPositiveInt(env.AUTH_RATE_LIMIT_FORGOT_MAX, defaults.maxRequests),
      windowMs: toPositiveInt(env.AUTH_RATE_LIMIT_FORGOT_WINDOW_MS, defaults.windowMs),
    };
  }

  return {
    maxRequests: toPositiveInt(env.AUTH_RATE_LIMIT_RESET_MAX, defaults.maxRequests),
    windowMs: toPositiveInt(env.AUTH_RATE_LIMIT_RESET_WINDOW_MS, defaults.windowMs),
  };
};

const parseForwardedForHeader = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0]?.trim();
  return first || null;
};

const getClientIdentifier = (request: Request): string => {
  const fromForwarded = parseForwardedForHeader(request.headers.get("x-forwarded-for"));
  if (fromForwarded) {
    return fromForwarded;
  }

  const fromCf = request.headers.get("cf-connecting-ip");
  if (fromCf) {
    return fromCf;
  }

  const fromRealIp = request.headers.get("x-real-ip");
  if (fromRealIp) {
    return fromRealIp;
  }

  return "unknown";
};

const cleanupExpiredEntries = (nowMs: number): void => {
  for (const [key, value] of rateLimitEntries.entries()) {
    if (value.resetAtMs <= nowMs) {
      rateLimitEntries.delete(key);
    }
  }
};

export const enforceAuthRateLimit = (input: {
  action: AuthRateLimitAction;
  request: Request;
  now?: Date;
}): void => {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  cleanupExpiredEntries(nowMs);

  const policy = resolvePolicy(input.action);
  const clientId = getClientIdentifier(input.request);
  if (clientId === "unknown") {
    return;
  }
  const key = `${input.action}:${clientId}`;
  const current = rateLimitEntries.get(key);

  if (!current || current.resetAtMs <= nowMs) {
    rateLimitEntries.set(key, {
      count: 1,
      resetAtMs: nowMs + policy.windowMs,
    });
    return;
  }

  if (current.count >= policy.maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000));
    throw new HttpError(429, "RATE_LIMIT_EXCEEDED", "Trop de tentatives. Réessayez plus tard.", {
      action: input.action,
      retryAfterSec,
    });
  }

  current.count += 1;
  rateLimitEntries.set(key, current);
};

export const resetAuthRateLimiterForTests = (): void => {
  rateLimitEntries.clear();
};
