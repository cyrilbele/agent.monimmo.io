# SPEC.md — Assistant IA pour agent immobilier (style “openclaw”)

## 1) Objectif

Centraliser échanges (Gmail, WhatsApp), événements (Google Calendar), documents, vocaux, et assister l’agent via IA :

- rattachement aux biens,
- classification documents,
- transcription + insights vocaux,
- “boîte de traitement” pour tout ce qui est incertain.

## 2) Monorepo et contraintes dev

### 2.1 monorepo

- `/backend` : Bun (HTTP vanilla), REST, OpenAPI **spec-first YAML**
- `/front` : Angular 21 + Tailwind
- `/ios` : Swift UIKit
- `/marketing-site` : HTML/JS vanilla

### 2.2 contraintes dev

Développement en français, appli pour agent immobiliers français
N'hésite pas à importer des npm si il y a un outil qui fait bien l abstraction
Cherche sur internet si tu ne sais pas
N'hésite pas à demander si il y a besoin
Fais une tache à la fois du fichier TASKS.md et coche la tache une fois réalisée

### 2.3 Tests

- Backend : unit + coverage ≥ 80% (CI fail sinon)
- Front : unit coverage ≥ 80% + E2E Playwright
- iOS : XCTest (snapshots optionnel)

## 3) Stack

- DB : SQLite (évolutif MySQL/SQL)
- ORM : Drizzle
- Validation : Zod
- Auth : JWT access+refresh
- Jobs : Redis + BullMQ
- Stockage fichiers : **abstraction** (S3 prod, local dev)
- Mets de l abstraction pour les connecteurs externe pour qu on puisse plugguer un autre outil de mail, autre calendrier...
- Connecteurs : Gmail, Google Calendar, WhatsApp, Telegram

---

## 4) Types de fichiers (documents) — en français

### 4.1 Enum `typeDocument`

Identité / situation :

- `PIECE_IDENTITE`
- `LIVRET_FAMILLE`
- `CONTRAT_MARIAGE_PACS`
- `JUGEMENT_DIVORCE`

Propriété :

- `TITRE_PROPRIETE`
- `ATTESTATION_NOTARIALE`
- `TAXE_FONCIERE`
- `REFERENCE_CADASTRALE`

Mandat / vente :

- `MANDAT_VENTE_SIGNE`
- `BON_VISITE`
- `OFFRE_ACHAT_SIGNEE`

Diagnostics (DDT) :

- `DPE`
- `AMIANTE`
- `PLOMB`
- `ELECTRICITE`
- `GAZ`
- `TERMITES`
- `ERP_ETAT_RISQUES`
- `ASSAINISSEMENT`
- `LOI_CARREZ`

Copropriété :

- `REGLEMENT_COPROPRIETE`
- `ETAT_DESCRIPTIF_DIVISION`
- `PV_AG_3_DERNIERES_ANNEES`
- `MONTANT_CHARGES`
- `CARNET_ENTRETIEN`
- `FICHE_SYNTHETIQUE`
- `PRE_ETAT_DATE`
- `ETAT_DATE`

Marketing :

- `PHOTOS_HD`
- `VIDEO_VISITE`
- `PLAN_BIEN`
- `ANNONCE_IMMOBILIERE`
- `AFFICHE_VITRINE`
- `REPORTING_VENDEUR`

Offre / financement :

- `SIMULATION_FINANCEMENT`
- `ATTESTATION_CAPACITE_EMPRUNT`
- `ACCORD_PRINCIPE_BANCAIRE`

Juridique :

- `COMPROMIS_OU_PROMESSE`
- `ANNEXES_COMPROMIS`
- `PREUVE_SEQUESTRE`
- `COURRIER_RETRACTATION`
- `LEVEE_CONDITIONS_SUSPENSIVES`
- `ACTE_AUTHENTIQUE`
- `DECOMPTE_NOTAIRE`

---

## 5) Convention DTO (simple, lisible, spec-first)

### 5.1 Règles

- **OpenAPI YAML = source de vérité**
  - fichier : `/backend/openapi/openapi.yaml`
- **Les DTO sont définis dans OpenAPI** via `components/schemas`
- **Types TS générés** depuis OpenAPI pour éviter les divergences
- **Validation runtime** avec Zod, alignée sur OpenAPI

### 5.2 Structure proposée

- `/backend/openapi/openapi.yaml`
- `/backend/src/dto/generated/` (auto) : types TS générés depuis OpenAPI
- `/backend/src/dto/zod/` (manuel, court) : schémas Zod par DTO
- `/backend/src/routes/` : handlers + validation Zod

### 5.3 Nommage des DTO

Dans OpenAPI `components/schemas` :

- `LoginRequest`, `LoginResponse`
- `PropertyCreateRequest`, `PropertyResponse`, `PropertyListResponse`
- `FileResponse`, `FileUpdateRequest`
- `MessageResponse`, `MessageListResponse`
- `VocalResponse`, etc.

Dans Zod :

- `LoginRequestSchema`, `PropertyCreateRequestSchema`, etc.

### 5.4 “Contrat” d’alignement

- Chaque endpoint référence explicitement un schema OpenAPI (request/response).
- Le handler backend applique le Zod correspondant.
- En CI : génération types TS + compilation obligatoire (si mismatch, ça casse).

---

## 6) API REST (sans versioning)

### Principes

- Base URL sans préfixe version : `/auth/*`, `/properties`, `/files`, etc.
- OpenAPI : `openapi.yaml` (spec-first)
- Erreurs : `{ code, message, details? }`
- Pagination : `limit` + `cursor`

### Endpoints minimaux

Auth

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`
- `POST /auth/register` (création compte)
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

Biens

- `GET /properties` / `POST /properties`
- `GET /properties/:id`
- `PATCH /properties/:id`
- `PATCH /properties/:id/status`
- `POST /properties/:id/participants`

Fichiers

- `POST /files/upload`
- `GET /files/:id`
- `GET /files/:id/download-url`
- `PATCH /files/:id`
- `POST /files/:id/run-ai`

Messages (Gmail/WhatsApp)

- `GET /messages`
- `GET /messages/:id`
- `PATCH /messages/:id` (propertyId)
- `POST /messages/:id/run-ai`

Vocaux

- `POST /vocals/upload`
- `GET /vocals` / `GET /vocals/:id`
- `PATCH /vocals/:id` (propertyId)
- `POST /vocals/:id/transcribe`
- `POST /vocals/:id/extract-insights`

Boîte de traitement

- `GET /review-queue`
- `POST /review-queue/:id/resolve`

Intégrations

- `POST /integrations/gmail/connect`
- `POST /integrations/gmail/sync`
- `POST /integrations/google-calendar/connect`
- `POST /integrations/google-calendar/sync`
- `POST /integrations/whatsapp/connect`
- `POST /integrations/whatsapp/sync`
