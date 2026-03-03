# Front (Angular 21 + Tailwind)

Le front est désormais une application Angular 21 (standalone components) avec styling Tailwind CSS.

## Lancer en local

```bash
cd front
bun install
bun run start
```

Application servie sur `http://localhost:5173`.

## Build

```bash
cd front
bun run build
```

## PWA / Hors ligne

- Le Service Worker Angular est active en build production.
- Les requetes API GET sont en politique `network-first` avec fallback cache en hors ligne.
- Pour valider le comportement PWA, servir le build `dist` en HTTPS (ou localhost), puis verifier l'installation et le mode hors ligne depuis les DevTools.

## Tests

```bash
cd front
bun run test
bun run test:coverage
```

## Routes (hash)

- `#/login`
- `#/inscription`
- `#/mot-de-passe`
- `#/mot-de-passe/reset?token=<TOKEN>`
- `#/app/kanban`
- `#/app/bien/nouveau`
- `#/app/bien/<PROPERTY_ID>`
- `#/app/configuration`
