import { closeAiQueueClient } from "./queues/client";
import { getQueueRedisConnection } from "./queues/connection";
import { startVocalRecoveryLoop, stopVocalRecoveryLoop } from "./queues/recovery";
import { startAiWorkers, stopAiWorkers } from "./queues/workers";

let workersStarted = false;
let shutdownInProgress = false;

const shutdown = async (signal: string) => {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;
  console.info(`[BullMQ] Arrêt demandé (${signal})`);

  if (workersStarted) {
    await stopVocalRecoveryLoop();
    await stopAiWorkers();
    await closeAiQueueClient();
  }

  console.info("[BullMQ] Arrêt terminé");
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  const redis = getQueueRedisConnection();
  await redis.ping();

  const workers = startAiWorkers();
  workersStarted = true;
  startVocalRecoveryLoop();
  const workerNames = Object.keys(workers).join(", ");
  console.info(`[BullMQ] Workers démarrés: ${workerNames}`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "erreur inconnue de connexion Redis";

  console.error(
    `[BullMQ] Impossible de démarrer les workers (Redis indisponible): ${message}`,
  );
  process.exit(1);
}
