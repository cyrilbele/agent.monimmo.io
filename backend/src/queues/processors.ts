import type { Job } from "bullmq";
import { aiJobsService } from "../ai";
import type { AiJobPayloadByKey, AiQueueKey } from "./types";

export type AiWorkerResult<K extends AiQueueKey = AiQueueKey> = {
  queue: K;
  jobId: string | undefined;
  processedAt: string;
};

export type AiProcessorMap = {
  [K in AiQueueKey]: (
    job: Job<AiJobPayloadByKey[K], AiWorkerResult<K>, string>,
  ) => Promise<AiWorkerResult<K>>;
};

type AiJobHandlers = Pick<
  typeof aiJobsService,
  | "processMessage"
  | "processFile"
  | "transcribeVocal"
  | "detectVocalType"
  | "extractInitialVisitPropertyParams"
  | "extractVocalInsights"
>;

export const createAiProcessorMap = (handlers: AiJobHandlers = aiJobsService): AiProcessorMap => ({
  processMessage: async (job) => {
    await handlers.processMessage({
      orgId: job.data.orgId,
      messageId: job.data.messageId,
    });

    return {
      queue: "processMessage",
      jobId: job.id,
      processedAt: new Date().toISOString(),
    };
  },
  processFile: async (job) => {
    await handlers.processFile({
      orgId: job.data.orgId,
      fileId: job.data.fileId,
    });

    return {
      queue: "processFile",
      jobId: job.id,
      processedAt: new Date().toISOString(),
    };
  },
  transcribeVocal: async (job) => {
    await handlers.transcribeVocal({
      orgId: job.data.orgId,
      vocalId: job.data.vocalId,
    });

    return {
      queue: "transcribeVocal",
      jobId: job.id,
      processedAt: new Date().toISOString(),
    };
  },
  detectVocalType: async (job) => {
    await handlers.detectVocalType({
      orgId: job.data.orgId,
      vocalId: job.data.vocalId,
    });

    return {
      queue: "detectVocalType",
      jobId: job.id,
      processedAt: new Date().toISOString(),
    };
  },
  extractInitialVisitPropertyParams: async (job) => {
    await handlers.extractInitialVisitPropertyParams({
      orgId: job.data.orgId,
      vocalId: job.data.vocalId,
    });

    return {
      queue: "extractInitialVisitPropertyParams",
      jobId: job.id,
      processedAt: new Date().toISOString(),
    };
  },
  extractVocalInsights: async (job) => {
    await handlers.extractVocalInsights({
      orgId: job.data.orgId,
      vocalId: job.data.vocalId,
    });

    return {
      queue: "extractVocalInsights",
      jobId: job.id,
      processedAt: new Date().toISOString(),
    };
  },
});
