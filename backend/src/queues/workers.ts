import { Worker, type WorkerOptions } from "bullmq";
import type IORedis from "ioredis";
import { resolveQueueRuntimeConfig } from "./config";
import { closeQueueRedisConnection, getQueueRedisConnection } from "./connection";
import {
  recordQueueJobCompleted,
  recordQueueJobFailed,
  recordQueueJobStarted,
} from "./metrics";
import { createAiProcessorMap, type AiProcessorMap } from "./processors";
import { AI_QUEUE_NAMES, type AiJobPayloadByKey, type AiQueueKey } from "./types";

type EnvLike = Record<string, string | undefined>;

export type AiWorkers = {
  processMessage: Worker<AiJobPayloadByKey["processMessage"]>;
  processFile: Worker<AiJobPayloadByKey["processFile"]>;
  transcribeVocal: Worker<AiJobPayloadByKey["transcribeVocal"]>;
  extractVocalInsights: Worker<AiJobPayloadByKey["extractVocalInsights"]>;
};

const createWorkerOptions = (connection: IORedis, concurrency: number): WorkerOptions => ({
  connection,
  concurrency,
});

type WorkerEventSource = Pick<
  Worker,
  "on"
>;

export const bindWorkerInstrumentation = (
  worker: WorkerEventSource,
  queueKey: AiQueueKey,
  queueName: string,
) => {
  worker.on("active", (job) => {
    recordQueueJobStarted(queueKey);
    console.info(`[BullMQ] job.start queue=${queueName} id=${job?.id ?? "n/a"}`);
  });

  worker.on("completed", (job) => {
    recordQueueJobCompleted(queueKey);
    console.info(`[BullMQ] job.done queue=${queueName} id=${job?.id ?? "n/a"}`);
  });

  worker.on("failed", (job, err) => {
    recordQueueJobFailed(queueKey);
    console.error(
      `[BullMQ] job.fail queue=${queueName} id=${job?.id ?? "n/a"} error=${err?.message ?? "unknown"}`,
    );
  });
};

export const createAiWorkers = (input: {
  connection: IORedis;
  concurrency: number;
  processors?: AiProcessorMap;
}): AiWorkers => {
  const processors = input.processors ?? createAiProcessorMap();
  const workerOptions = createWorkerOptions(input.connection, input.concurrency);

  const workers = {
    processMessage: new Worker<AiJobPayloadByKey["processMessage"]>(
      AI_QUEUE_NAMES.processMessage,
      processors.processMessage,
      workerOptions,
    ),
    processFile: new Worker<AiJobPayloadByKey["processFile"]>(
      AI_QUEUE_NAMES.processFile,
      processors.processFile,
      workerOptions,
    ),
    transcribeVocal: new Worker<AiJobPayloadByKey["transcribeVocal"]>(
      AI_QUEUE_NAMES.transcribeVocal,
      processors.transcribeVocal,
      workerOptions,
    ),
    extractVocalInsights: new Worker<AiJobPayloadByKey["extractVocalInsights"]>(
      AI_QUEUE_NAMES.extractVocalInsights,
      processors.extractVocalInsights,
      workerOptions,
    ),
  };

  bindWorkerInstrumentation(
    workers.processMessage,
    "processMessage",
    AI_QUEUE_NAMES.processMessage,
  );
  bindWorkerInstrumentation(workers.processFile, "processFile", AI_QUEUE_NAMES.processFile);
  bindWorkerInstrumentation(
    workers.transcribeVocal,
    "transcribeVocal",
    AI_QUEUE_NAMES.transcribeVocal,
  );
  bindWorkerInstrumentation(
    workers.extractVocalInsights,
    "extractVocalInsights",
    AI_QUEUE_NAMES.extractVocalInsights,
  );

  return workers;
};

let aiWorkersSingleton: AiWorkers | null = null;

export const startAiWorkers = (env: EnvLike = process.env): AiWorkers => {
  if (aiWorkersSingleton) {
    return aiWorkersSingleton;
  }

  const config = resolveQueueRuntimeConfig(env);
  aiWorkersSingleton = createAiWorkers({
    connection: getQueueRedisConnection(env),
    concurrency: config.workerConcurrency,
  });

  return aiWorkersSingleton;
};

export const stopAiWorkers = async (): Promise<void> => {
  if (!aiWorkersSingleton) {
    return;
  }

  const workers = aiWorkersSingleton;
  aiWorkersSingleton = null;

  await Promise.all(
    Object.values(workers).map(async (worker) => {
      await worker.close();
    }),
  );
  await closeQueueRedisConnection();
};
