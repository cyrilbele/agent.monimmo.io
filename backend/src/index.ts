import { createApp } from "./server";
import { resolveAIProviderKind } from "./ai/factory";
import { runAICallLogRetentionPass, startAICallLogRetentionLoop, stopAICallLogRetentionLoop } from "./ai/log-retention";
import { resolveSearchEngineKind } from "./search/factory";

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  ...createApp(),
});

startAICallLogRetentionLoop(process.env);
void runAICallLogRetentionPass();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopAICallLogRetentionLoop();
  });
}

console.info(`Backend démarré sur http://localhost:${port}`);
console.info(`[Backend] ENABLE_QUEUE=${process.env.ENABLE_QUEUE === "true" ? "true" : "false"}`);
console.info(`[Backend] SEARCH_ENGINE=${resolveSearchEngineKind(process.env)}`);
console.info(`[Backend] AI_PROVIDER_DEFAULT=${resolveAIProviderKind(process.env)}`);
