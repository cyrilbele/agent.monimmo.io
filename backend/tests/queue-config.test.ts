import { describe, expect, it } from "bun:test";
import { resolveQueueRuntimeConfig } from "../src/queues/config";

describe("queue runtime config", () => {
  it("applique des defaults robustes", () => {
    const config = resolveQueueRuntimeConfig({});

    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.workerConcurrency).toBe(5);
    expect(config.defaultJobOptions).toMatchObject({
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  });

  it("respecte les variables d'environnement quand elles sont valides", () => {
    const config = resolveQueueRuntimeConfig({
      REDIS_URL: "redis://127.0.0.1:6380",
      BULLMQ_ATTEMPTS: "9",
      BULLMQ_BACKOFF_DELAY_MS: "12000",
      BULLMQ_REMOVE_ON_COMPLETE: "150",
      BULLMQ_REMOVE_ON_FAIL: "300",
      BULLMQ_WORKER_CONCURRENCY: "12",
    });

    expect(config.redisUrl).toBe("redis://127.0.0.1:6380");
    expect(config.workerConcurrency).toBe(12);
    expect(config.defaultJobOptions).toMatchObject({
      attempts: 9,
      backoff: {
        type: "exponential",
        delay: 12000,
      },
      removeOnComplete: 150,
      removeOnFail: 300,
    });
  });

  it("retombe sur les defaults si la config est invalide", () => {
    const config = resolveQueueRuntimeConfig({
      BULLMQ_ATTEMPTS: "-1",
      BULLMQ_BACKOFF_DELAY_MS: "abc",
      BULLMQ_REMOVE_ON_COMPLETE: "-3",
      BULLMQ_REMOVE_ON_FAIL: "x",
      BULLMQ_WORKER_CONCURRENCY: "0",
    });

    expect(config.workerConcurrency).toBe(5);
    expect(config.defaultJobOptions).toMatchObject({
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  });
});
