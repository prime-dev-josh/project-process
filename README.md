# NEXUS | Project Process

An editable force-directed process map for hiring, people flow, and the PM lifecycle. The UI is a single-page **TanStack Start** app: React 19, TypeScript, Vite, and **react-force-graph-2d** (d3-force). The **shared map** is stored in **Azure SQL**; the browser keeps a local cache and syncs edits through a delta API.

## Tech stack

| Layer | Choices |
| --- | --- |
| UI | React 19, Tailwind CSS 4, canvas node/link rendering |
| App framework | TanStack Start, TanStack Router (file routes), TanStack Store |
| Data fetching | TanStack Query (map poll + hydration) |
| Validation | Zod (`src/schema/*`) |
| Database | Azure SQL (`mssql` + `@azure/identity`) |
| Graph layout | d3-force via react-force-graph-2d |

## Prerequisites

- **Node.js 22+** (matches `Dockerfile`)
- **npm** (lockfile: `package-lock.json`)
- **Azure CLI** logged in (`az login`) when running against real SQL locally
- **Python 3** for one-time schema setup (`npm run sql:setup`)

## Quick start

```bash
npm install
npm run sql:setup   # creates projectprocess schema/tables if needed
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

Copy `.env.example` to `.env` when you need to override SQL or Graph settings (see below).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `AZURE_SQL_SERVER` | SQL server host (default in code: `sql-primeae-eastus2.database.windows.net`) |
| `AZURE_SQL_DATABASE` | Database name (default: `atg-requirements`) |
| `GRAPH_TOKEN` | Optional bearer token for Microsoft Graph profile photos (`/api/people/photo`) |

Auth to SQL uses **Azure AD** (local: Azure CLI credentials; deployed: managed identity). See `.env.example`.

## npm scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server on port **5173** |
| `npm run build` | Production client + server bundle |
| `npm run preview` | Preview production build |
| `npm run generate-routes` | Regenerate TanStack Router route tree (`tsr`) |
| `npm run sql:setup` | Run `scripts/projectprocess_sql.py` against Azure SQL |

Typecheck (no script alias): `npx tsc --noEmit`

## Project layout

```
src/
  App.tsx                 Main shell: filters, canvas, panels, keyboard shortcuts
  components/             UI (GraphCanvas, FilterPanel, pickers, menus, HelpTab)
  graph/                  Pure graph logic: colors, groups, hulls, flow, history, ops
  hooks/useMapSync.ts     Poll shared map, hydrate store, drive connection status
  lib/                    mapSync client, photos, dropdown portal, placement
  routes/
    index.tsx             App route
    api/map.ts            GET full/delta map, POST transactional writes
    api/health.ts         Health check
    api/people/photo.ts   Entra photo proxy
  schema/                 Zod models for graph entities and UI state
  server/                 mapStore, Azure SQL, HTTP helpers (server-only)
  store/                  graphStore, outbox, sync feed, UI toasts
  storage.ts              LocalStorage cache + view prefs (not the source of truth)
scripts/                  SQL migration/setup Python helpers
```

Path alias: `#/*` → `./src/*` (see `package.json` `imports`).

## How editing and sync work

1. **graphStore** (`src/store/graph.ts`) holds nodes, links, groups, optimistic versions, and local undo/redo.
2. User edits call **commitGraph** / **enqueueTx**; transactions POST to **`/api/map`** with optional `baseVersions` for conflict detection.
3. **Outbox** retries failed writes; conflicts reload the latest map from the server.
4. **useMapSync** polls deltas after hydration and merges remote changes; the bell feed surfaces other users’ edits.
5. **localStorage** (`storage.ts`) caches the last known document and **per-device** view settings (theme, rotation, physics sliders). It is not the shared database.

Session-only UI state (for example **highlight flow**) lives in React state in `App.tsx` and is never sent to SQL.

## API surface (local)

- `GET /api/map` — full document + revision
- `GET /api/map?since=<revision>` — delta
- `POST /api/map` — transactional patch (nodes, links, groups, positions)
- `GET /api/health` — liveness
- `GET /api/people/photo?email=` — profile photo bytes (when Graph token available)

Contracts are validated with Zod in `src/schema/graph.ts` and `src/routes/api/map.ts`.

## Database

- Schema: **`projectprocess`** on database **`atg-requirements`**
- Server access: `src/server/azureSql.ts`, persistence: `src/server/mapStore.ts`
- Tables: **Map**, **Node** (includes `group_id`), **Link**, **ChangeLog**, **[Group]**. View settings and highlight flow are not stored in SQL.

### Which script to run

| Situation | What to run |
|-----------|-------------|
| New database or you want one idempotent upgrade | `npm run sql:setup` (`scripts/projectprocess_sql.py`) — creates schema/tables, adds sync columns, **Group** table, indexes |
| DBA/manual T-SQL or grant App Service identity | `scripts/projectprocess_migration.sql` (steps 1–4; step 3 is the managed identity user/roles) |
| All slots run a build that no longer uses legacy columns | `scripts/projectprocess_migration_post_deploy.sql` or `python scripts/projectprocess_sql.py --drop-legacy` — drops `Map.settings_json`, `Node.fx`, `Node.fy` |

If **`projectprocess.[Group]`** and **`Node.group_id`** already exist, you do not need a new migration for membrane rendering, highlight flow, or filter UX.

## Production build

```bash
npm run build
```

Docker (Node 22, port **8080**):

```bash
docker build -t project-process .
docker run -p 8080:8080 project-process
```

`vite.config.ts` marks `mssql` / `@azure/identity` as SSR externals; the runtime image installs production dependencies so the server can load them.

## Sample data and import/export

- Bundled JSON graphs: `src/data/graphs/*.json`
- Header **Import** / **Export** round-trips a full `GraphDocument` JSON file for backup or migration (separate from live SQL sync).

## Product help

In-app documentation for end users lives in the **Information** panel → **Help** tab (`src/components/HelpTab.tsx`). Update that file when behavior visible in the UI changes.

## Agent / skills note

This repo lists TanStack **Intent** skills in `package.json`. If `npm exec --no -- intent list` fails in your environment, use the codebase and this README; do not substitute a different Intent install without team agreement.
