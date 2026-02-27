import { reviewQueueService } from "../review-queue/service";
import { vocalsService, type VocalRecoveryStep } from "../vocals/service";
import { enqueueAiDetectVocalType, enqueueAiTranscribeVocal, getAiQueueClient } from "./client";
import { getQueueRedisConnection } from "./connection";

type EnvLike = Record<string, string | undefined>;

export type VocalRecoveryConfig = {
  staleAfterMs: number;
  intervalMs: number;
  maxAttempts: number;
  batchSize: number;
};

type VocalRecoverySummary = {
  requeuedTranscriptions: number;
  requeuedTypeDetections: number;
  finalized: number;
};

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

export const resolveVocalRecoveryConfig = (env: EnvLike = process.env): VocalRecoveryConfig => ({
  staleAfterMs: parsePositiveInteger(env.VOCAL_RECOVERY_STALE_AFTER_MS, 5 * 60 * 1000),
  intervalMs: parsePositiveInteger(env.VOCAL_RECOVERY_INTERVAL_MS, 60 * 1000),
  maxAttempts: parsePositiveInteger(env.VOCAL_RECOVERY_MAX_ATTEMPTS, 3),
  batchSize: parsePositiveInteger(env.VOCAL_RECOVERY_BATCH_SIZE, 100),
});

const toJobIdPart = (value: string): string => value.replaceAll(":", "_");
const buildJobId = (...parts: string[]): string => parts.map(toJobIdPart).join("__");

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message.trim();
  }

  return "Erreur inconnue";
};

const finalizeVocal = async (input: {
  orgId: string;
  vocalId: string;
  step: VocalRecoveryStep;
  message: string;
}) => {
  await vocalsService.markProcessingFailure({
    orgId: input.orgId,
    id: input.vocalId,
    step: input.step,
    message: input.message,
    isFinal: true,
  });

  await reviewQueueService.createOpenItem({
    orgId: input.orgId,
    itemType: "VOCAL",
    itemId: input.vocalId,
    reason: "VOCAL_PROCESSING_ERROR",
    payload: {
      step: input.step,
      error: input.message.slice(0, 500),
      source: "recovery",
    },
  });
};

export const runVocalRecoveryPass = async (
  config: VocalRecoveryConfig = resolveVocalRecoveryConfig(),
): Promise<VocalRecoverySummary> => {
  await getQueueRedisConnection().ping();
  const queueClient = getAiQueueClient();
  const summary: VocalRecoverySummary = {
    requeuedTranscriptions: 0,
    requeuedTypeDetections: 0,
    finalized: 0,
  };
  const staleBefore = new Date(Date.now() - config.staleAfterMs);

  const recoverable = await vocalsService.listAbandonedForRecovery({
    staleBefore,
    maxAttempts: config.maxAttempts,
    limit: config.batchSize,
  });

  for (const vocal of recoverable.transcribe) {
    const attemptNumber = vocal.processingAttempts + 1;
    await vocalsService.registerRecoveryAttempt({
      orgId: vocal.orgId,
      id: vocal.id,
    });

    try {
      await enqueueAiTranscribeVocal(
        queueClient,
        {
          orgId: vocal.orgId,
          vocalId: vocal.id,
        },
        {
          jobId: buildJobId(
            "vocal",
            "transcribe",
            "recovery",
            vocal.orgId,
            vocal.id,
            String(attemptNumber),
            String(Date.now()),
          ),
        },
      );
      summary.requeuedTranscriptions += 1;
    } catch (error) {
      if (attemptNumber >= config.maxAttempts) {
        await finalizeVocal({
          orgId: vocal.orgId,
          vocalId: vocal.id,
          step: "TRANSCRIBE",
          message: `Reprise impossible: ${getErrorMessage(error)}`,
        });
        summary.finalized += 1;
      } else {
        await vocalsService.markProcessingFailure({
          orgId: vocal.orgId,
          id: vocal.id,
          step: "TRANSCRIBE",
          message: `Reprise impossible: ${getErrorMessage(error)}`,
          isFinal: false,
        });
      }
    }
  }

  for (const vocal of recoverable.detectType) {
    const attemptNumber = vocal.processingAttempts + 1;
    await vocalsService.registerRecoveryAttempt({
      orgId: vocal.orgId,
      id: vocal.id,
    });

    try {
      await enqueueAiDetectVocalType(
        queueClient,
        {
          orgId: vocal.orgId,
          vocalId: vocal.id,
        },
        {
          jobId: buildJobId(
            "vocal",
            "type",
            "recovery",
            vocal.orgId,
            vocal.id,
            String(attemptNumber),
            String(Date.now()),
          ),
        },
      );
      summary.requeuedTypeDetections += 1;
    } catch (error) {
      if (attemptNumber >= config.maxAttempts) {
        await finalizeVocal({
          orgId: vocal.orgId,
          vocalId: vocal.id,
          step: "DETECT_TYPE",
          message: `Reprise impossible: ${getErrorMessage(error)}`,
        });
        summary.finalized += 1;
      } else {
        await vocalsService.markProcessingFailure({
          orgId: vocal.orgId,
          id: vocal.id,
          step: "DETECT_TYPE",
          message: `Reprise impossible: ${getErrorMessage(error)}`,
          isFinal: false,
        });
      }
    }
  }

  const exhausted = await vocalsService.listRecoveryExhausted({
    staleBefore,
    minAttempts: config.maxAttempts,
    limit: config.batchSize * 2,
  });

  for (const vocal of exhausted) {
    const step: VocalRecoveryStep = vocal.status === "UPLOADED" ? "TRANSCRIBE" : "DETECT_TYPE";
    await finalizeVocal({
      orgId: vocal.orgId,
      vocalId: vocal.id,
      step,
      message: `Vocal abandonné: aucune progression détectée après ${config.maxAttempts} tentatives`,
    });
    summary.finalized += 1;
  }

  return summary;
};

let recoveryInterval: ReturnType<typeof setInterval> | null = null;
let recoveryPassInFlight: Promise<void> | null = null;
let activeConfig: VocalRecoveryConfig | null = null;

const runRecoveryLoopPass = async (): Promise<void> => {
  if (!activeConfig) {
    return;
  }

  const summary = await runVocalRecoveryPass(activeConfig);
  if (
    summary.requeuedTranscriptions > 0 ||
    summary.requeuedTypeDetections > 0 ||
    summary.finalized > 0
  ) {
    console.info(
      `[BullMQ] vocal.recovery requeued_transcribe=${summary.requeuedTranscriptions} requeued_type=${summary.requeuedTypeDetections} finalized=${summary.finalized}`,
    );
  }
};

const runRecoverySafely = async (): Promise<void> => {
  if (recoveryPassInFlight) {
    return recoveryPassInFlight;
  }

  recoveryPassInFlight = runRecoveryLoopPass()
    .catch((error) => {
      const message = getErrorMessage(error);
      console.error(`[BullMQ] vocal.recovery error=${message}`);
    })
    .finally(() => {
      recoveryPassInFlight = null;
    });

  return recoveryPassInFlight;
};

export const startVocalRecoveryLoop = (env: EnvLike = process.env): void => {
  if (recoveryInterval) {
    return;
  }

  activeConfig = resolveVocalRecoveryConfig(env);
  void runRecoverySafely();
  recoveryInterval = setInterval(() => {
    void runRecoverySafely();
  }, activeConfig.intervalMs);
};

export const stopVocalRecoveryLoop = async (): Promise<void> => {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }

  if (recoveryPassInFlight) {
    await recoveryPassInFlight;
  }

  activeConfig = null;
};
