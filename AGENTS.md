# AGENTS.md

Ce fichier sert de guide rapide pour les contributeurs humains et les agents IA qui travaillent dans ce repo.

## Contexte projet

Monimmo est un assistant IA pour agents immobiliers francais.

Objectifs principaux:

- centraliser les canaux de communication (email, WhatsApp, etc.)
- rattacher messages/fichiers/vocaux aux biens
- automatiser classification et analyse IA
- escalader les cas incertains vers une review queue

## Source de verite

- Spec produit: `SPEC.md`
- Contrat API: `backend/openapi/openapi.yaml`

## Regles de contribution

1. Lire `SPEC.md` avant toute modification significative.
2. Maintenir compatibilite API/OpenAPI/Zod.
3. Ajouter/mettre a jour les tests avec les changements backend.
4. toujours faire les tests et maintenir un coverage de 80%
5. pour le front end, ne pas stocker dans le localStorage des données immobilières qui pourraient etre utile sur d autres front-end, toujours persister dans le back-end

## Regles pour la UI

Ne pas afficher les identifiants techniques, cela ne parle pas à l utilisateur
Attention à respecter les accents en français dans les textes affichés

## Lancer chaque piece

### Infra (Redis)

```bash
bun run dev:infra:up
```

### Backend API

```bash
bun run --cwd backend db:migrate
bun run --cwd backend db:seed
bun run dev:backend
```

### Worker IA (BullMQ)

```bash
cd backend
ENABLE_QUEUE=true bun run worker
```

### Front

```bash
cd front
bun run build
```

### Marketing site

```bash
cd marketing-site
bun run build
```

### iOS

Le dossier `ios/` est un squelette. Lancer depuis Xcode quand le projet sera initialise.

## Verification minimale avant livraison

Backend:

```bash
cd backend
bun run typecheck
bun run test
bun run test:coverage
bun run build
```

Root CI local:

```bash
bun run ci
```

## Notes runtime

- `ENABLE_QUEUE=false` (defaut) evite les erreurs Redis quand le worker n'est pas lance.
- Les integrations externes tournent en mode mock par defaut (`CONNECTOR_RUNTIME=mock`).
- Le provider IA est mock par defaut (`AI_PROVIDER=mock`).
