# Backend Monimmo

API REST Bun pour l'assistant IA immobilier (spec-first OpenAPI, validation Zod, persistence SQLite/Drizzle, jobs BullMQ, connecteurs externes mockables).

## Stack

- Runtime: Bun
- API: HTTP vanilla
- DB: SQLite
- ORM: Drizzle
- Validation: Zod
- Auth: JWT access + refresh
- Queue: BullMQ + Redis
- Stockage fichiers: abstraction local/S3

## Arborescence

- `openapi/openapi.yaml`: source de verite API
- `src/server.ts`: routes HTTP
- `src/dto/generated/`: types TS generes OpenAPI
- `src/dto/zod/`: schemas Zod runtime
- `src/db/`: schema, migration, seed
- `src/auth/`: auth + RBAC
- `src/files/`: fichiers + classification
- `src/messages/`: inbox messages
- `src/vocals/`: upload/transcription/insights
- `src/review-queue/`: file de resolution humaine
- `src/ai/`: interface AIProvider + MockAIProvider + jobs
- `src/integrations/`: connect/sync Gmail, Calendar, WhatsApp
- `src/queues/`: BullMQ queues/workers/metrics/dispatch
- `src/worker.ts`: process worker BullMQ

## Setup local

Depuis la racine du repo:

```bash
bun run dev:infra:up
bun run --cwd backend db:migrate
bun run --cwd backend db:seed
bun run dev
```

API: `http://localhost:3000`

`bun run dev` lance backend + front + worker, avec `ENABLE_QUEUE=true` force pour backend + worker.

## Worker IA

Si tu n'utilises pas `bun run dev`, lance-le dans un autre terminal:

```bash
cd backend
ENABLE_QUEUE=true bun run worker
```

Sans `ENABLE_QUEUE=true`, les endpoints `run-ai` renvoient `QUEUED` mais sans pousser de jobs Redis.

Le worker lance aussi une reprise automatique des vocaux abandonnes:
- vocaux `UPLOADED` trop anciens => requeue transcription
- vocaux `TRANSCRIBED` sans type => requeue detection type
- au-dela du seuil de tentatives, le vocal passe en `ERREUR_TRAITEMENT` avec `processingError`

## Endpoints utiles

- `GET /health`
- `GET /openapi.yaml`
- `GET /docs`
- Auth: `/auth/*`, `/me`
- Biens: `/properties*`
- Fichiers: `/files*`
- Messages: `/messages*`
- Vocaux: `/vocals*`
- Review queue: `/review-queue*`
- Integrations: `/integrations/*`

## Scripts

```bash
bun run dev
bun run start
bun run worker
bun run db:migrate
bun run db:seed
bun run generate:dto
bun run check:dto
bun run typecheck
bun run test
bun run test:coverage
bun run build
```

## Environnement

Variables principales:

- `DATABASE_URL` (defaut: `data/app.db`)
- `REDIS_URL`
- `ENABLE_QUEUE`
- `BULLMQ_ATTEMPTS`
- `BULLMQ_BACKOFF_DELAY_MS`
- `BULLMQ_REMOVE_ON_COMPLETE`
- `BULLMQ_REMOVE_ON_FAIL`
- `BULLMQ_WORKER_CONCURRENCY`
- `VOCAL_RECOVERY_STALE_AFTER_MS`
- `VOCAL_RECOVERY_INTERVAL_MS`
- `VOCAL_RECOVERY_MAX_ATTEMPTS`
- `VOCAL_RECOVERY_BATCH_SIZE`
- `AI_PROVIDER` (`mock` ou `openai`)
- `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_WHISPER_MODEL`, `OPENAI_BASE_URL`
- `CONNECTOR_RUNTIME` (`mock`)
- `INTEGRATION_TOKEN_SECRET`
- Stockage: `STORAGE_PROVIDER`, `LOCAL_STORAGE_DIR`, `APP_BASE_URL`, `S3_*`, `AWS_*`

## Tests

```bash
bun run typecheck
bun run test
bun run test:coverage
```

Les scripts `test` et `test:coverage` forcent `AI_PROVIDER=mock` et `CONNECTOR_RUNTIME=mock`.

Objectif coverage backend: >= 80% (bloquant CI).
