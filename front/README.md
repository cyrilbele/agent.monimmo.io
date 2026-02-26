# Front

Pages Auth livrées pour les tâches :

- `L1` Login
- `L2` Création de compte
- `L3` Mot de passe perdu + reset

## Lancer en local

```bash
cd front
bun run build
```

Puis ouvrir `front/index.html`.

## Dev server front

Depuis la racine du repo:

```bash
bun run dev
```

Le front est servi sur `http://localhost:5173` (modifiable via `FRONT_PORT`).

## Routes (hash)

- `#/login`
- `#/inscription`
- `#/mot-de-passe`
- `#/mot-de-passe/reset?token=<TOKEN>`
- `#/app/kanban`
- `#/app/bien/nouveau`
- `#/app/bien/<PROPERTY_ID>`
- `#/app/configuration`
