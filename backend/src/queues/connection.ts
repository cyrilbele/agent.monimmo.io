import IORedis from "ioredis";
import { resolveQueueRuntimeConfig } from "./config";

type EnvLike = Record<string, string | undefined>;

export const createQueueRedisConnection = (redisUrl: string): IORedis => {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  });

  // Les erreurs de connexion sont gérées explicitement au démarrage des workers.
  connection.on("error", () => undefined);

  return connection;
};

let queueRedisConnectionSingleton: IORedis | null = null;

export const getQueueRedisConnection = (env: EnvLike = process.env): IORedis => {
  queueRedisConnectionSingleton ??= createQueueRedisConnection(
    resolveQueueRuntimeConfig(env).redisUrl,
  );
  return queueRedisConnectionSingleton;
};

export const closeQueueRedisConnection = async (): Promise<void> => {
  if (!queueRedisConnectionSingleton) {
    return;
  }

  const connection = queueRedisConnectionSingleton;
  queueRedisConnectionSingleton = null;

  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
};
