# TASKS.md — Liste de tâches unitaires (à cocher)

> L’IA coche `[x]` une fois terminé et ajoute un lien PR/commit.  
> Contraintes : API sans versioning, stockage local dev + S3 prod, tests backend+front ≥ 80%.

## A) Monorepo & CI

- [x] A1 Créer monorepo avec `/backend /front /ios /marketing-site` (commit: bf6a6ef)
- [x] A2 GitHub Actions : build + tests + coverage (backend+front) + seuil 80% bloquant (commit: b7a5df7)
- [x] A3 Docker compose dev : Redis + (optionnel) services dev (commit: 6cdf9d3)

## B) OpenAPI spec-first + DTO convention

- [x] B1 Créer `/backend/openapi/openapi.yaml` (schemas + endpoints) (commit: 8560312)
- [x] B2 Mettre en place génération types TS depuis OpenAPI (`/src/dto/generated`) (commit: 49d89bb)
- [x] B3 Mettre en place Zod schemas (`/src/dto/zod`) + mapping clair (1 DTO = 1 schema) (commit: e806a56)
- [x] B4 Exposer doc OpenAPI (route `/openapi.yaml` + éventuellement swagger UI) (commit: 26c4d0c)

## C) Backend fondations (Bun vanilla)

- [x] C1 Serveur Bun + `GET /health` (commit: bf6a6ef)
- [x] C2 Gestion erreurs normalisées `{code,message,details?}` (commit: f5513e5)
- [x] C3 Drizzle + SQLite + migrations + seed minimal (commit: 2f84d4c)
- [x] C4 Auth JWT access+refresh : login/refresh/logout + `GET /me` (commit: 4a4fb3a)
- [x] C5 Auth utilisateur : `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password` (commit: 1d1e706)
- [x] C6 RBAC + scoping `orgId` partout (tests obligatoires) (commit: a860c8c)

## D) Stockage fichiers (abstraction)

- [x] D1 Implémenter `StorageProvider` + `LocalStorageProvider` (commit: 7c483c0)
- [x] D2 Implémenter `S3StorageProvider` (AWS S3 + URLs signées) (commit: bb462e3)
- [x] D3 Switch provider via env (dev=local, prod=s3) (commit: 3848128)
- [x] D4 Tests unitaires provider local + mocks S3 (commit: 275d2c7)

## E) Biens (kanban-ready)

- [x] E1 CRUD `properties` + pagination cursor (commit: 1310f93)
- [x] E2 `PATCH /properties/:id/status` + timeline event auto (commit: 10bbf15)
- [x] E3 Participants PropertyParty + endpoints (commit: 691ab57)
- [x] E4 Tests unitaires services biens + couverture (commit: e172e6d)

## F) Fichiers & classification

- [x] F1 `POST /files/upload` + DB File (avec typeDocument) (commit: de08277)
- [x] F2 `GET /files/:id/download-url` (local ou S3) (commit: de08277)
- [x] F3 `PATCH /files/:id` (propertyId/typeDocument/status) (commit: de08277)
- [x] F4 Types documents en français (enum `typeDocument`) + tests

## G) Queue Redis (BullMQ)

- [x] G1 Setup BullMQ (queues, workers, retry/backoff)
- [x] G2 Logs jobs start/end/fail + métriques simples (compteurs)

## H) Inbox Messages (Gmail + WhatsApp)

- [x] H1 `GET /messages` + filtres (canal, bien, statut IA)
- [x] H2 Rattachement manuel message→bien (`PATCH /messages/:id`)
- [x] H3 Lien attachments (fileIds)

## I) IA (mockable) + boîte de traitement

- [x] I1 Définir interface `AIProvider` + `MockAIProvider`
- [x] I2 Job `aiProcessMessage` (matching bien + règles review queue)
- [x] I3 Job `aiProcessFile` (classification typeDocument + review queue)
- [x] I4 ReviewQueue : `GET /review-queue` + `POST /review-queue/:id/resolve`
- [x] I5 Tests règles review queue + matching + classification

## J) Vocaux : transcription + insights

- [x] J1 `POST /vocals/upload` (audio -> Storage + DB Vocal)
- [x] J2 Job `aiTranscribeVocal` (transcript + summary)
- [x] J3 Job `aiExtractInsights` (insights JSON)
- [x] J4 Endpoints `POST /vocals/:id/transcribe` + `/vocals/:id/extract-insights`
- [x] J5 ReviewQueue sur vocaux (transcript vide / faible confiance / bien ambigu)
- [x] J6 Tests parsing insights + règles

## K) Intégrations

- [x] K1 Gmail OAuth connect + tokens chiffrés
- [x] K2 Gmail sync incrémental + idempotence + import attachments → Files
- [x] K3 Calendar OAuth connect + sync incrémental événements
- [x] K4 WhatsApp : définir provider + ingestion messages + médias
- [x] K5 Enqueue IA après ingestion (messages/fichiers)

---

# Front Angular 21 + Tailwind (1 tâche par page)

## L) Pages Auth

- [x] L1 Page **Login** (commit: local)
- [x] L2 Page **Création de compte** (commit: local)
- [x] L3 Page **Mot de passe perdu** (+ reset) (commit: local)

## M) Pages Métier

- [x] M1 Page **Liste des biens en Kanban** (1 colonne par statut) (commit: local)
- [x] M2 Page **création de bien** (commit: local)
- [x] M3 Page **Détail d’un bien** (timeline + documents + participants) (commit: local)
- [x] M4 Page **Configuration** (connecter gmail, google calendar, whats app) (commit: local)

## N) Tests Front

- [x] N1 Unit tests + coverage ≥ 80% (bloquant en CI) (commit: local)
- [ ] N2 E2E Playwright : parcours login → kanban → ouvrir bien → inbox
