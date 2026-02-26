import { createApp } from "./server";

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  ...createApp(),
});

console.info(`Backend démarré sur http://localhost:${port}`);

