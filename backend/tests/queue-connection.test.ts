import { describe, expect, it } from "bun:test";
import {
  closeQueueRedisConnection,
  getQueueRedisConnection,
} from "../src/queues/connection";

describe("queue connection", () => {
  it("retourne un singleton puis recrée une connexion après fermeture", async () => {
    const env = { REDIS_URL: "redis://127.0.0.1:6399" };

    const first = getQueueRedisConnection(env);
    const second = getQueueRedisConnection(env);

    expect(first).toBe(second);

    await closeQueueRedisConnection();

    const third = getQueueRedisConnection(env);
    expect(third).not.toBe(first);

    await closeQueueRedisConnection();
  });

  it("bascule sur disconnect si quit échoue", async () => {
    const env = { REDIS_URL: "redis://127.0.0.1:6398" };

    const connection = getQueueRedisConnection(env);
    const originalQuit = connection.quit.bind(connection);
    const originalDisconnect = connection.disconnect.bind(connection);

    let disconnectCalled = false;

    connection.quit = (async () => {
      throw new Error("quit_failed");
    }) as typeof connection.quit;
    connection.disconnect = (() => {
      disconnectCalled = true;
      return originalDisconnect();
    }) as typeof connection.disconnect;

    await closeQueueRedisConnection();

    expect(disconnectCalled).toBe(true);

    connection.quit = originalQuit;
    connection.disconnect = originalDisconnect;
  });
});
