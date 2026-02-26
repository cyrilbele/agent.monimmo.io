import {
  enqueueAiExtractVocalInsights,
  enqueueAiProcessFile,
  enqueueAiProcessMessage,
  enqueueAiTranscribeVocal,
  getAiQueueClient,
} from "./client";

type QueueResult = {
  jobId: string;
  status: "QUEUED";
};

const fallbackJobId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;
const isQueueEnabled = (): boolean => process.env.ENABLE_QUEUE === "true";

export const enqueueMessageAiJob = async (payload: {
  orgId: string;
  messageId: string;
}): Promise<QueueResult> => {
  if (!isQueueEnabled()) {
    return {
      jobId: fallbackJobId("msg"),
      status: "QUEUED",
    };
  }

  try {
    const job = await enqueueAiProcessMessage(getAiQueueClient(), payload, {
      jobId: `msg:${payload.orgId}:${payload.messageId}`,
    });

    return {
      jobId: String((job as { id?: string }).id ?? fallbackJobId("msg")),
      status: "QUEUED",
    };
  } catch (error) {
    console.warn("[BullMQ] enqueue message fallback:", error);
    return {
      jobId: fallbackJobId("msg"),
      status: "QUEUED",
    };
  }
};

export const enqueueFileAiJob = async (payload: {
  orgId: string;
  fileId: string;
}): Promise<QueueResult> => {
  if (!isQueueEnabled()) {
    return {
      jobId: fallbackJobId("file"),
      status: "QUEUED",
    };
  }

  try {
    const job = await enqueueAiProcessFile(getAiQueueClient(), payload, {
      jobId: `file:${payload.orgId}:${payload.fileId}`,
    });

    return {
      jobId: String((job as { id?: string }).id ?? fallbackJobId("file")),
      status: "QUEUED",
    };
  } catch (error) {
    console.warn("[BullMQ] enqueue file fallback:", error);
    return {
      jobId: fallbackJobId("file"),
      status: "QUEUED",
    };
  }
};

export const enqueueVocalTranscriptionJob = async (payload: {
  orgId: string;
  vocalId: string;
}): Promise<QueueResult> => {
  if (!isQueueEnabled()) {
    return {
      jobId: fallbackJobId("vocal_transcribe"),
      status: "QUEUED",
    };
  }

  try {
    const job = await enqueueAiTranscribeVocal(getAiQueueClient(), payload, {
      jobId: `vocal:transcribe:${payload.orgId}:${payload.vocalId}`,
    });

    return {
      jobId: String((job as { id?: string }).id ?? fallbackJobId("vocal_transcribe")),
      status: "QUEUED",
    };
  } catch (error) {
    console.warn("[BullMQ] enqueue vocal transcribe fallback:", error);
    return {
      jobId: fallbackJobId("vocal_transcribe"),
      status: "QUEUED",
    };
  }
};

export const enqueueVocalInsightsJob = async (payload: {
  orgId: string;
  vocalId: string;
}): Promise<QueueResult> => {
  if (!isQueueEnabled()) {
    return {
      jobId: fallbackJobId("vocal_insights"),
      status: "QUEUED",
    };
  }

  try {
    const job = await enqueueAiExtractVocalInsights(getAiQueueClient(), payload, {
      jobId: `vocal:insights:${payload.orgId}:${payload.vocalId}`,
    });

    return {
      jobId: String((job as { id?: string }).id ?? fallbackJobId("vocal_insights")),
      status: "QUEUED",
    };
  } catch (error) {
    console.warn("[BullMQ] enqueue vocal insights fallback:", error);
    return {
      jobId: fallbackJobId("vocal_insights"),
      status: "QUEUED",
    };
  }
};
