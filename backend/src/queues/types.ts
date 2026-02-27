export const AI_QUEUE_NAMES = {
  processMessage: "ai.process-message",
  processFile: "ai.process-file",
  transcribeVocal: "ai.transcribe-vocal",
  detectVocalType: "ai.detect-vocal-type",
  extractInitialVisitPropertyParams: "ai.extract-initial-visit-property-params",
  extractVocalInsights: "ai.extract-vocal-insights",
} as const;

export const AI_JOB_NAMES = {
  processMessage: "process-message",
  processFile: "process-file",
  transcribeVocal: "transcribe-vocal",
  detectVocalType: "detect-vocal-type",
  extractInitialVisitPropertyParams: "extract-initial-visit-property-params",
  extractVocalInsights: "extract-vocal-insights",
} as const;

export type AiQueueKey = keyof typeof AI_QUEUE_NAMES;

export type AiProcessMessagePayload = {
  orgId: string;
  messageId: string;
};

export type AiProcessFilePayload = {
  orgId: string;
  fileId: string;
};

export type AiTranscribeVocalPayload = {
  orgId: string;
  vocalId: string;
};

export type AiDetectVocalTypePayload = {
  orgId: string;
  vocalId: string;
};

export type AiExtractInitialVisitPropertyParamsPayload = {
  orgId: string;
  vocalId: string;
};

export type AiExtractVocalInsightsPayload = {
  orgId: string;
  vocalId: string;
};

export type AiJobPayloadByKey = {
  processMessage: AiProcessMessagePayload;
  processFile: AiProcessFilePayload;
  transcribeVocal: AiTranscribeVocalPayload;
  detectVocalType: AiDetectVocalTypePayload;
  extractInitialVisitPropertyParams: AiExtractInitialVisitPropertyParamsPayload;
  extractVocalInsights: AiExtractVocalInsightsPayload;
};
