# Monimmo Assistant IA

Assistant IA pour agents immobiliers francais: prospection, suivi client, vente, gestion documentaire, inbox multicanal, vocaux et integrations externes.

## Monorepo

- `backend/`: API Bun + Drizzle + SQLite + BullMQ + OpenAPI spec-first
- `front/`: front web (squelette actuel)
- `ios/`: application iOS UIKit (squelette actuel)
- `marketing-site/`: site marketing statique
- `SPEC.md`: specification produit
- `TASKS.md`: suivi des taches

## Prerequis

- Bun >= 1.3
- Docker + Docker Compose (pour Redis)
- Git
- (optionnel) Xcode pour iOS

## Installation

```bash
bun install
```

## Configuration

Copier les variables d'environnement:

```bash
cp .env.example .env
```

Variables importantes:

- `REDIS_URL`: URL Redis
- `ENABLE_QUEUE`: `true` pour activer les enqueues BullMQ reelles
- `VOCAL_RECOVERY_STALE_AFTER_MS` / `VOCAL_RECOVERY_INTERVAL_MS`: cadence de reprise vocaux abandonnes
- `VOCAL_RECOVERY_MAX_ATTEMPTS`: nombre max de relances avant `ERREUR_TRAITEMENT`
- `AI_PROVIDER`: provider IA (`mock` ou `openai`)
- `OPENAI_API_KEY`: clé API OpenAI (si `AI_PROVIDER=openai`)
- `CONNECTOR_RUNTIME`: runtime des connecteurs externes (`mock`)
- `INTEGRATION_TOKEN_SECRET`: secret de chiffrement tokens OAuth
- `CORS_ALLOWED_ORIGINS`: origines front autorisées (liste séparée par virgules)

## Lancer chaque piece

### 1) Infra Redis

```bash
bun run dev:infra:up
```

Arret:

```bash
bun run dev:infra:down
```

### 2) Backend API

```bash
bun run --cwd backend db:migrate
bun run --cwd backend db:seed
bun run dev:backend
```

API locale: `http://localhost:3000`

- Health: `GET /health`
- OpenAPI YAML: `GET /openapi.yaml`
- Swagger UI: `GET /docs`

### 3) Worker BullMQ (jobs IA)

Dans un 2eme terminal:

```bash
cd backend
ENABLE_QUEUE=true bun run worker
```

Important: Redis doit etre actif.

### 4) Front

Commandes disponibles:

```bash
cd front
bun run build
```

Le build est genere dans `front/dist/`.

### 4 bis) Lancer backend + front + worker en meme temps

```bash
bun run dev
```

- Backend: `http://localhost:3000`
- Front: `http://localhost:5173`
- Backend + Worker BullMQ: `ENABLE_QUEUE=true` forcé par le script dev

Important: Redis doit etre actif (`redis-cli ping` -> `PONG`).

### 5) Marketing site

```bash
cd marketing-site
bun run build
```

Le build est genere dans `marketing-site/dist/`.

### 6) iOS

Le dossier `ios/` est un squelette. Ouvrir avec Xcode quand le projet iOS sera initialise.

## Tests et qualite

### Backend

```bash
cd backend
bun run typecheck
bun run test
bun run test:coverage
bun run build
```

### Root CI local

```bash
bun run ci
```

## Etat actuel

Le backend des taches `G` a `K` (queue, messages, IA, vocaux, integrations) est implemente et teste.

## Workflow recommande

1. Lire `SPEC.md`
2. Prendre la prochaine tache dans `TASKS.md`
3. Implementer + tester
4. Cocher la tache
