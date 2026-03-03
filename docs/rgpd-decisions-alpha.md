# Decisions RGPD - Monimmo (alpha)

Date: 2026-03-03  
Portee: front + backend applicatifs  
Statut: valide (decisions produit/techniques)

## Objectif

Figer les decisions RGPD operationnelles pour l'alpha, avec priorite a une mise en conformite technique rapide sans contrainte de retrocompatibilite.

## Arbitrages valides

### 1. Donnees IA: caviardage uniquement dans les logs

- Le caviardage est applique aux logs IA (`ai_call_logs`) uniquement.
- Les donnees metier en base (users/messages/vocals/files/properties) ne sont pas caviardees.
- Les logs IA conservent la version brute en base pour l'exploitation interne et stockent aussi une version caviardee dediee a l'exposition/consultation.
- La retention des logs IA est fixee a 90 jours stricts.
- Une purge automatique quotidienne supprime les logs expires.

### 2. Auth: tokens conserves dans la reponse API

- Les tokens `accessToken` et `refreshToken` restent presents dans les reponses d'authentification pour compatibilite multi-frontend.
- Le mode "cookies HttpOnly only" est rejete comme modele unique.
- Cible RGPD compatible:
  - rotation stricte des refresh tokens;
  - durees de vie courtes pour access token;
  - revocation serveur et invalidation de session;
  - limitation du stockage persistant cote front web (pas de localStorage pour tokens en clair);
  - stockage adapte a chaque client (memoire web, secure storage mobile, etc.).

### 3. RBAC sur les logs IA

- L'endpoint `/me/ai-calls` reste accessible selon le comportement produit historique.
- L'onglet "Appels IA" reste visible dans Configuration comme avant.

### 4. DSAR minimum a implementer

- Export:
  - `POST /privacy/exports`
  - `GET /privacy/exports/{id}`
- Effacement:
  - `POST /privacy/erase`
- Traitement asynchrone obligatoire avec statut d'avancement et trace d'execution.

### 5. Effacement applicatif transverse

- Le droit a l'effacement couvre:
  - tables metier reliees a l'organisation cible;
  - logs IA;
  - index/repliques de recherche (QMD);
  - objets fichiers en storage via `storage.deleteObject`.
- L'effacement peut etre suppression ou anonymisation irreversible selon dependances.

### 6. Minimisation recherche QMD

- Desactivee pour l'alpha: les documents QMD conservent les champs complets (email, telephone, notes) pour permettre la recherche metier, notamment par numero.

### 7. Durcissement securite

- Ajouter headers:
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
- Activer rate limiting sur:
  - `POST /auth/login`
  - `POST /auth/forgot-password`
  - `POST /auth/reset-password`

## Decisions explicitement rejetees

- Caviarder les donnees metier directement en base: rejete pour l'alpha.
- Forcer un modele auth exclusivement base sur cookies HttpOnly: rejete pour compatibilite multi-frontend.

## Criteres d'acceptation minimum

- Les logs IA sont caviardes et purges apres 90 jours.
- Les tokens restent disponibles dans les reponses auth, avec controles de securite renforces.
- Les endpoints DSAR existent et executent un traitement asynchrone tracable.
- Les roles non autorises n'accedent pas aux logs IA.

## Note de gouvernance

Ce document couvre les decisions techniques produit pour l'alpha.  
Les livrables juridiques/compliance (registre des traitements, clauses contractuelles, DPA, documentation CNIL) restent a maintenir en parallele.
