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
