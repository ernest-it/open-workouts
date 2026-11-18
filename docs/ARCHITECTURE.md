# Architecture

```
┌────────────────────┐        ┌────────────────────┐
│  Mobile app (Expo) │        │  Web UI (React)    │
│  iOS + Android     │        │  served by server  │
│  ── main frontend  │        │                    │
│  WorkoutStore      │        │  WorkoutStore      │
│  + SQLite snapshot │        │  + IndexedDB       │
└─────────┬──────────┘        └─────────┬──────────┘
          │  HTTPS  POST /api/v1/sync   │
          └──────────────┬──────────────┘
                ┌────────▼─────────┐
                │ Server (Fastify) │  one container, port 8080
                │  auth · sync     │
                │  import/export   │
                │  static web UI   │
                └────────┬─────────┘
                         │
                 SQLite (WAL) in /data
```

## Repository layout

| Path | What |
|---|---|
| `packages/shared` | **Domain core**, used by every other part: zod schemas, sync types, training maths (1RM, plates, warm-ups), Strong CSV import/export, stats and PRs, LLM-ready training digests and workout comparisons (`insights.ts`), and `WorkoutStore` (the offline-first client store and sync engine). |
| `apps/server` | Fastify + better-sqlite3. Bundled into one `dist/index.js` by esbuild. Also contains the LLM providers (`llm.ts`), the insights service with its weekly scheduler (`insights.ts`), and the MCP endpoint (`mcp.ts`). |
| `apps/web` | React + Vite. Built to static files that the server serves. |
| `apps/mobile` | Expo / React Native app. Kept outside the npm workspaces so that its pinned React/RN versions stay isolated. Metro resolves `@open-workouts/shared` from source. |
| `deploy/` | Kubernetes manifests and the Proxmox LXC installer. |

**Key design choice: logic lives in `shared`, not in the frontends.** The web and mobile apps use the same store and the same domain actions (`startWorkout`, `addExerciseToWorkout`, `finishWorkout`, `saveWorkoutAsTemplate`, …). Records, history and charts are computed on the client from local data. As a result:

- the server stays thin, and
- the app works fully offline, including a **local-only mode with no server at all**.

## Data model

All weights are stored in **kg**, distances in **m**, and durations in **s**. Unit conversion happens only in the UI.

```
exercises ──< workoutExercises >── workouts
                  │
                  └──< sets             (sets also carry workoutId, for cheap queries)

templateFolders ──< templates ──< templateExercises ──< templateSets
measurements      (body_weight, body_fat, caloric_intake, 15 circumferences)
settings          (id = key, value = JSON; e.g. "prefs")
```

**Common fields.** Every row has `id`, `createdAt`, `updatedAt`, `deletedAt` (epoch ms).

**IDs:**
- Clients generate UUIDs.
- Imported rows get **deterministic IDs** (a hash of their content), which is what makes a re-import idempotent.
- Built-in exercises use `builtin:<slug>` IDs. They are compiled into the shared package and are **never synced**; the server rejects writes to them.

**Exercise fields:**
- `logType` decides which fields a set uses: `weight_reps`, `weighted_bodyweight`, `assisted_bodyweight`, `reps`, `duration` or `distance_duration`.
- `equipment` and `bodyPart` are independent of `logType`.

**Sets:**
- `kind` is `normal`, `warmup`, `drop` or `failure`.
- Warm-ups are excluded from records and volume.
- Sets that aren't `completed` are discarded when the workout is finished.

The server derives one SQLite table per collection directly from the zod schemas (`apps/server/src/db.ts`). **Adding a field to a schema adds the column automatically** on the next start (additive migrations).

## Sync protocol (v1)

There is a single endpoint. Third-party clients can implement it easily.

```
POST /api/v1/sync
Authorization: Bearer <token>
{ "since": <number>, "changes": { "<collection>": [ <full row>, ... ], ... } }

200 OK
{ "rev": <number>, "more": <bool>,
  "changes": { "<collection>": [ <row>, ... ] },
  "rejected": [ { "collection", "id", "error" } ] }
```

**Client side:**
1. Keep `rev` (initially `0`) and the set of locally modified row IDs (the "pending" rows).
2. Push all pending rows as **complete rows**, not patches.
3. Apply the returned rows, but skip any row that was edited locally again while the request was in flight. That row stays pending and goes up on the next sync.
4. Store the returned `rev`. If `more` is true, call again with `changes: {}` until it is false.

**Server side** (one transaction per request):
1. Validate each row against the zod schema. Invalid rows are reported in `rejected`; they never fail the whole request.
2. Resolve conflicts with **last-write-wins per row** on `updatedAt`. Ties go to the incoming row. Rows with `updatedAt` more than 24 h in the future are rejected, to limit the damage from a broken clock.
3. Give every written row a new value from a global, monotonically increasing `rev`.
4. Return the user's rows with `rev > since`, ordered by `rev`, in pages of 5,000.

**Deletes** are soft (`deletedAt`), so they propagate to every device.

**Why per-row LWW and not CRDTs or per-field merging?** In a workout logger, nearly all concurrent edits touch different rows: one set row per tap. The few that collide, such as renaming the same workout on two devices, are fine with "last edit wins". The tradeoff is documented; a field-level merge can be added later without changing the protocol.

## REST API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/v1/health` | – | Liveness/readiness |
| `GET /api/v1/server-info` | – | `{name, version, apiVersion, registrationOpen, serverId}`. The app uses it to recognise a server |
| `GET /api/v1/exercises/builtin` | – | The built-in exercise library |
| `POST /api/v1/auth/register` | – | `{username, password, deviceName?}` → `{token, user}`. The first user becomes admin; after that, registration needs `ALLOW_REGISTRATION=true` |
| `POST /api/v1/auth/login` | – | Same shape. Rate-limited per IP |
| `POST /api/v1/auth/logout` | ✓ | Revokes the current token |
| `POST /api/v1/auth/password` | ✓ | Changes the password and revokes the user's other sessions |
| `GET /api/v1/me`, `DELETE /api/v1/me` | ✓ | Profile; delete the account and all its data |
| `GET /api/v1/sessions`, `DELETE /api/v1/sessions/:id` | ✓ | List and revoke devices |
| `POST /api/v1/tokens` | ✓ | Create a named long-lived API token |
| `POST /api/v1/sync` | ✓ | See above |
| `POST /api/v1/import/strong?weightUnit=kg\|lb&distanceUnit=km\|mi&tzOffset=<min>` | ✓ | Body: the CSV (`text/csv`) or `{"csv": "..."}` |
| `GET /api/v1/export/strong.csv?weightUnit=&distanceUnit=` | ✓ | Strong-compatible CSV |
| `GET /api/v1/export/json` | ✓ | Full backup; re-importable through `/sync` |
| `/api/v1/insights/*` | ✓ | AI insights: digest, reports, comparisons, Q&A, weekly schedule; see [AI_INSIGHTS.md](AI_INSIGHTS.md) |
| `POST /mcp` | ✓ | Read-only MCP server (Streamable HTTP, JSON-RPC) for AI assistants |

**Authentication.** Opaque bearer tokens (`ow_…`, 256-bit). Only their SHA-256 hash is stored. Passwords are hashed with scrypt (N=16384, r=8, p=1).

## Testing

- **`npm test`** runs:
  - `shared` unit tests: maths, all three CSV variants, idempotent import, export round-trip, store flows, PR detection;
  - `server` integration tests: auth, registration lock, two-device sync with conflicts and deletes, user isolation and validation, 12k-row paginated pull, import/export.
- **Web UI:** driven end to end with Playwright during development.
- **Mobile:** type-checked; `npm run export:android` verifies the Metro bundle.
