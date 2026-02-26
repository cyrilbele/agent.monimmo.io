import type { JobsOptions } from "bullmq";

type EnvLike = Record<string, string | undefined>;

const parsePositiveInteger = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const parseNonNegativeInteger = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

export type QueueRuntimeConfig = {
  redisUrl: string;
  workerConcurrency: number;
  defaultJobOptions: JobsOptions;
};

export const resolveQueueRuntimeConfig = (env: EnvLike = process.env): QueueRuntimeConfig => {
  const attempts = parsePositiveInteger(env.BULLMQ_ATTEMPTS, 5);
  const backoffDelayMs = parsePositiveInteger(env.BULLMQ_BACKOFF_DELAY_MS, 3000);
  const removeOnComplete = parseNonNegativeInteger(env.BULLMQ_REMOVE_ON_COMPLETE, 1000);
  const removeOnFail = parseNonNegativeInteger(env.BULLMQ_REMOVE_ON_FAIL, 5000);
  const workerConcurrency = parsePositiveInteger(env.BULLMQ_WORKER_CONCURRENCY, 5);

  return {
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    workerConcurrency,
    defaultJobOptions: {
      attempts,
      backoff: {
        type: "exponential",
        delay: backoffDelayMs,
      },
      removeOnComplete,
      removeOnFail,
    },
  };
};
