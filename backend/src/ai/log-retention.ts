import { aiCallLogsService } from "./call-logs";

type EnvLike = Record<string, string | undefined>;

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
let retentionLoopTimer: ReturnType<typeof setInterval> | null = null;
let retentionLoopRunning = false;

const resolveRetentionIntervalMs = (env: EnvLike = process.env): number => {
  const raw = Number(env.AI_CALL_LOG_RETENTION_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 60_000) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.min(Math.floor(raw), DEFAULT_INTERVAL_MS * 7);
};

export const runAICallLogRetentionPass = async (): Promise<{ deleted: number }> => {
  const result = await aiCallLogsService.purgeExpired();
  return result;
};

export const startAICallLogRetentionLoop = (env: EnvLike = process.env): void => {
  if (retentionLoopTimer) {
    return;
  }

  const intervalMs = resolveRetentionIntervalMs(env);
  retentionLoopTimer = setInterval(() => {
    if (retentionLoopRunning) {
      return;
    }

    retentionLoopRunning = true;
    void runAICallLogRetentionPass()
      .then(({ deleted }) => {
        if (deleted > 0) {
          console.info(`[AI][RETENTION] ${deleted} log(s) supprimes`);
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[AI][RETENTION] purge failed: ${message}`);
      })
      .finally(() => {
        retentionLoopRunning = false;
      });
  }, intervalMs);
};

export const stopAICallLogRetentionLoop = (): void => {
  if (!retentionLoopTimer) {
    return;
  }

  clearInterval(retentionLoopTimer);
  retentionLoopTimer = null;
  retentionLoopRunning = false;
};
