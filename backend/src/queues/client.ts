import { Queue, type JobsOptions } from "bullmq";
import type IORedis from "ioredis";
import { resolveQueueRuntimeConfig } from "./config";
import { getQueueRedisConnection } from "./connection";
import { AI_JOB_NAMES, AI_QUEUE_NAMES, type AiJobPayloadByKey } from "./types";

type EnvLike = Record<string, string | undefined>;

type QueueWriter<DataType> = {
  add: (name: string, data: DataType, opts?: JobsOptions) => Promise<unknown>;
};

export type AiQueueClient = {
  processMessage: QueueWriter<AiJobPayloadByKey["processMessage"]>;
  processFile: QueueWriter<AiJobPayloadByKey["processFile"]>;
  transcribeVocal: QueueWriter<AiJobPayloadByKey["transcribeVocal"]>;
  detectVocalType: QueueWriter<AiJobPayloadByKey["detectVocalType"]>;
  extractInitialVisitPropertyParams: QueueWriter<
    AiJobPayloadByKey["extractInitialVisitPropertyParams"]
  >;
  extractVocalInsights: QueueWriter<AiJobPayloadByKey["extractVocalInsights"]>;
};

export type AiBullQueueClient = {
  processMessage: Queue<AiJobPayloadByKey["processMessage"]>;
  processFile: Queue<AiJobPayloadByKey["processFile"]>;
  transcribeVocal: Queue<AiJobPayloadByKey["transcribeVocal"]>;
  detectVocalType: Queue<AiJobPayloadByKey["detectVocalType"]>;
  extractInitialVisitPropertyParams: Queue<
    AiJobPayloadByKey["extractInitialVisitPropertyParams"]
  >;
  extractVocalInsights: Queue<AiJobPayloadByKey["extractVocalInsights"]>;
};

const createQueue = <DataType>(
  name: string,
  connection: IORedis,
  defaultJobOptions: JobsOptions,
): Queue<DataType> =>
  new Queue<DataType>(name, {
    connection,
    defaultJobOptions,
  });

export const createAiQueueClient = (input: {
  connection: IORedis;
  defaultJobOptions: JobsOptions;
}): AiBullQueueClient => ({
  processMessage: createQueue(
    AI_QUEUE_NAMES.processMessage,
    input.connection,
    input.defaultJobOptions,
  ),
  processFile: createQueue(AI_QUEUE_NAMES.processFile, input.connection, input.defaultJobOptions),
  transcribeVocal: createQueue(
    AI_QUEUE_NAMES.transcribeVocal,
    input.connection,
    input.defaultJobOptions,
  ),
  detectVocalType: createQueue(
    AI_QUEUE_NAMES.detectVocalType,
    input.connection,
    input.defaultJobOptions,
  ),
  extractInitialVisitPropertyParams: createQueue(
    AI_QUEUE_NAMES.extractInitialVisitPropertyParams,
    input.connection,
    input.defaultJobOptions,
  ),
  extractVocalInsights: createQueue(
    AI_QUEUE_NAMES.extractVocalInsights,
    input.connection,
    input.defaultJobOptions,
  ),
});

let aiQueueClientSingleton: AiBullQueueClient | null = null;

export const getAiQueueClient = (env: EnvLike = process.env): AiBullQueueClient => {
  if (aiQueueClientSingleton) {
    return aiQueueClientSingleton;
  }

  const config = resolveQueueRuntimeConfig(env);
  aiQueueClientSingleton = createAiQueueClient({
    connection: getQueueRedisConnection(env),
    defaultJobOptions: config.defaultJobOptions,
  });

  return aiQueueClientSingleton;
};

export const closeAiQueueClient = async (): Promise<void> => {
  if (!aiQueueClientSingleton) {
    return;
  }

  const queueClient = aiQueueClientSingleton;
  aiQueueClientSingleton = null;

  await Promise.all(
    Object.values(queueClient).map(async (queue) => {
      await queue.close();
    }),
  );
};

export const enqueueAiProcessMessage = (
  queueClient: Pick<AiQueueClient, "processMessage">,
  payload: AiJobPayloadByKey["processMessage"],
  options?: JobsOptions,
) => queueClient.processMessage.add(AI_JOB_NAMES.processMessage, payload, options);

export const enqueueAiProcessFile = (
  queueClient: Pick<AiQueueClient, "processFile">,
  payload: AiJobPayloadByKey["processFile"],
  options?: JobsOptions,
) => queueClient.processFile.add(AI_JOB_NAMES.processFile, payload, options);

export const enqueueAiTranscribeVocal = (
  queueClient: Pick<AiQueueClient, "transcribeVocal">,
  payload: AiJobPayloadByKey["transcribeVocal"],
  options?: JobsOptions,
) => queueClient.transcribeVocal.add(AI_JOB_NAMES.transcribeVocal, payload, options);

export const enqueueAiDetectVocalType = (
  queueClient: Pick<AiQueueClient, "detectVocalType">,
  payload: AiJobPayloadByKey["detectVocalType"],
  options?: JobsOptions,
) => queueClient.detectVocalType.add(AI_JOB_NAMES.detectVocalType, payload, options);

export const enqueueAiExtractInitialVisitPropertyParams = (
  queueClient: Pick<AiQueueClient, "extractInitialVisitPropertyParams">,
  payload: AiJobPayloadByKey["extractInitialVisitPropertyParams"],
  options?: JobsOptions,
) =>
  queueClient.extractInitialVisitPropertyParams.add(
    AI_JOB_NAMES.extractInitialVisitPropertyParams,
    payload,
    options,
  );

export const enqueueAiExtractVocalInsights = (
  queueClient: Pick<AiQueueClient, "extractVocalInsights">,
  payload: AiJobPayloadByKey["extractVocalInsights"],
  options?: JobsOptions,
) => queueClient.extractVocalInsights.add(AI_JOB_NAMES.extractVocalInsights, payload, options);
