import { Worker, type Job, type WorkerOptions } from "bullmq";
import type IORedis from "ioredis";
import { reviewQueueService } from "../review-queue/service";
import { vocalsService, type VocalRecoveryStep } from "../vocals/service";
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
  detectVocalType: Worker<AiJobPayloadByKey["detectVocalType"]>;
  extractInitialVisitPropertyParams: Worker<
    AiJobPayloadByKey["extractInitialVisitPropertyParams"]
  >;
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

const VOCAL_FAILURE_STEP_BY_QUEUE: Partial<
  Record<AiQueueKey, VocalRecoveryStep | "INSIGHTS" | "INITIAL_VISIT_PARAMS">
> = {
  transcribeVocal: "TRANSCRIBE",
  detectVocalType: "DETECT_TYPE",
  extractVocalInsights: "INSIGHTS",
  extractInitialVisitPropertyParams: "INITIAL_VISIT_PARAMS",
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 1000);
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim().slice(0, 1000);
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message.trim().slice(0, 1000);
  }

  return "Erreur inconnue";
};

const extractVocalPayload = (
  job: Job | undefined,
): { orgId: string; vocalId: string } | null => {
  if (!job?.data || typeof job.data !== "object") {
    return null;
  }

  const payload = job.data as Record<string, unknown>;
  if (typeof payload.orgId !== "string" || typeof payload.vocalId !== "string") {
    return null;
  }

  return {
    orgId: payload.orgId,
    vocalId: payload.vocalId,
  };
};

const persistVocalFailure = async (input: {
  queueKey: AiQueueKey;
  queueName: string;
  job: Job | undefined;
  error: unknown;
}) => {
  const step = VOCAL_FAILURE_STEP_BY_QUEUE[input.queueKey];
  if (!step) {
    return;
  }

  const payload = extractVocalPayload(input.job);
  if (!payload) {
    return;
  }

  const attemptsAllowed =
    typeof input.job?.opts?.attempts === "number" && input.job.opts.attempts > 0
      ? input.job.opts.attempts
      : 1;
  const attemptsMade =
    typeof input.job?.attemptsMade === "number" && input.job.attemptsMade > 0
      ? input.job.attemptsMade
      : 1;
  const isFinal = attemptsMade >= attemptsAllowed;
  const message = getErrorMessage(input.error);

  await vocalsService.markProcessingFailure({
    orgId: payload.orgId,
    id: payload.vocalId,
    step,
    message,
    isFinal,
  });

  if (isFinal) {
    await reviewQueueService.createOpenItem({
      orgId: payload.orgId,
      itemType: "VOCAL",
      itemId: payload.vocalId,
      reason: "VOCAL_PROCESSING_ERROR",
      payload: {
        step,
        queue: input.queueName,
        attemptsMade,
        attemptsAllowed,
        error: message,
      },
    });
  }
};

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
    void persistVocalFailure({
      queueKey,
      queueName,
      job,
      error: err,
    }).catch((failure) => {
      const message = failure instanceof Error ? failure.message : "unknown";
      console.error(
        `[BullMQ] vocal failure persistence failed queue=${queueName} id=${job?.id ?? "n/a"} error=${message}`,
      );
    });
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
    detectVocalType: new Worker<AiJobPayloadByKey["detectVocalType"]>(
      AI_QUEUE_NAMES.detectVocalType,
      processors.detectVocalType,
      workerOptions,
    ),
    extractInitialVisitPropertyParams: new Worker<
      AiJobPayloadByKey["extractInitialVisitPropertyParams"]
    >(
      AI_QUEUE_NAMES.extractInitialVisitPropertyParams,
      processors.extractInitialVisitPropertyParams,
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
    workers.detectVocalType,
    "detectVocalType",
    AI_QUEUE_NAMES.detectVocalType,
  );
  bindWorkerInstrumentation(
    workers.extractInitialVisitPropertyParams,
    "extractInitialVisitPropertyParams",
    AI_QUEUE_NAMES.extractInitialVisitPropertyParams,
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
