# TASKS.md — Liste de tâches unitaires (à cocher)

> L’IA coche `[x]` une fois terminé et ajoute un lien PR/commit.  
> Contraintes : API sans versioning, stockage local dev + S3 prod, tests backend+front ≥ 80%.

## A) Monorepo & CI

- [x] A1 Créer monorepo avec `/backend /front /ios /marketing-site` (commit: bf6a6ef)
- [x] A2 GitHub Actions : build + tests + coverage (backend+front) + seuil 80% bloquant
- [ ] A3 Docker compose dev : Redis + (optionnel) services dev

## B) OpenAPI spec-first + DTO convention

- [ ] B1 Créer `/backend/openapi/openapi.yaml` (schemas + endpoints)
- [ ] B2 Mettre en place génération types TS depuis OpenAPI (`/src/dto/generated`)
- [ ] B3 Mettre en place Zod schemas (`/src/dto/zod`) + mapping clair (1 DTO = 1 schema)
- [ ] B4 Exposer doc OpenAPI (route `/openapi.yaml` + éventuellement swagger UI)

## C) Backend fondations (Bun vanilla)

- [x] C1 Serveur Bun + `GET /health` (commit: bf6a6ef)
- [ ] C2 Gestion erreurs normalisées `{code,message,details?}`
- [ ] C3 Drizzle + SQLite + migrations + seed minimal
- [ ] C4 Auth JWT access+refresh : login/refresh/logout + `GET /me`
- [ ] C5 Auth utilisateur : `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- [ ] C6 RBAC + scoping `orgId` partout (tests obligatoires)

## D) Stockage fichiers (abstraction)

- [ ] D1 Implémenter `StorageProvider` + `LocalStorageProvider`
- [ ] D2 Implémenter `S3StorageProvider` (AWS S3 + URLs signées)
- [ ] D3 Switch provider via env (dev=local, prod=s3)
- [ ] D4 Tests unitaires provider local + mocks S3

## E) Biens (kanban-ready)

- [ ] E1 CRUD `properties` + pagination cursor
- [ ] E2 `PATCH /properties/:id/status` + timeline event auto
- [ ] E3 Participants PropertyParty + endpoints
- [ ] E4 Tests unitaires services biens + couverture

## F) Fichiers & classification

- [ ] F1 `POST /files/upload` + DB File (avec typeDocument)
- [ ] F2 `GET /files/:id/download-url` (local ou S3)
- [ ] F3 `PATCH /files/:id` (propertyId/typeDocument/status)
- [ ] F4 Types documents en français (enum `typeDocument`) + tests

## G) Queue Redis (BullMQ)

- [ ] G1 Setup BullMQ (queues, workers, retry/backoff)
- [ ] G2 Logs jobs start/end/fail + métriques simples (compteurs)

## H) Inbox Messages (Gmail + WhatsApp)

- [ ] H1 `GET /messages` + filtres (canal, bien, statut IA)
- [ ] H2 Rattachement manuel message→bien (`PATCH /messages/:id`)
- [ ] H3 Lien attachments (fileIds)

## I) IA (mockable) + boîte de traitement

- [ ] I1 Définir interface `AIProvider` + `MockAIProvider`
- [ ] I2 Job `aiProcessMessage` (matching bien + règles review queue)
- [ ] I3 Job `aiProcessFile` (classification typeDocument + review queue)
- [ ] I4 ReviewQueue : `GET /review-queue` + `POST /review-queue/:id/resolve`
- [ ] I5 Tests règles review queue + matching + classification

## J) Vocaux : transcription + insights

- [ ] J1 `POST /vocals/upload` (audio -> Storage + DB Vocal)
- [ ] J2 Job `aiTranscribeVocal` (transcript + summary)
- [ ] J3 Job `aiExtractInsights` (insights JSON)
- [ ] J4 Endpoints `POST /vocals/:id/transcribe` + `/vocals/:id/extract-insights`
- [ ] J5 ReviewQueue sur vocaux (transcript vide / faible confiance / bien ambigu)
- [ ] J6 Tests parsing insights + règles

## K) Intégrations

- [ ] K1 Gmail OAuth connect + tokens chiffrés
- [ ] K2 Gmail sync incrémental + idempotence + import attachments → Files
- [ ] K3 Calendar OAuth connect + sync incrémental événements
- [ ] K4 WhatsApp : définir provider + ingestion messages + médias
- [ ] K5 Enqueue IA après ingestion (messages/fichiers)

---

# Front Angular 21 + Tailwind (1 tâche par page)

## L) Pages Auth

- [ ] L1 Page **Login**
- [ ] L2 Page **Création de compte**
- [ ] L3 Page **Mot de passe perdu** (+ reset)

## M) Pages Métier

- [ ] M1 Page **Liste des biens en Kanban** (1 colonne par statut)
- [ ] M2 Page **Détail d’un bien** (timeline + documents + participants)
- [ ] M3 Page **Inbox** (emails + WhatsApp, filtres, rattachement)

## N) Tests Front

- [ ] N1 Unit tests (Jest) + coverage ≥ 80% (bloquant en CI)
- [ ] N2 E2E Playwright : parcours login → kanban → ouvrir bien → inbox
