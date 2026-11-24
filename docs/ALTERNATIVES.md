# Alternatives & reusable data

This is a survey of existing open-source, source-available and self-hostable trackers (as of Nov 2026), and what Open Workouts takes from each.

> **Caveat on the numbers.** The GitHub API was unreachable during research. Star counts and dates are therefore approximate, taken from repository pages and search results.

## Full-stack, self-hostable

| Project | License | Stack | Self-host | Sync / mobile | Strong import | Notes |
|---|---|---|---|---|---|---|
| [openGym](https://github.com/DuarteSantos8/openGym) | AGPL-3.0 (media proprietary) | `node:http` API, React 19 + Vite, **JSON files** (no DB) | Compose, GHCR amd64/arm64, Helm | Offline-first PWA + Capacitor apps, Apple Watch; per-profile revision with 409 → field merge | Yes (+ FitNotes, Hevy) | Closest concept to ours. Weak points: JSON-file storage, proprietary exercise media |
| [LiftTrace](https://github.com/traceapps/lifttrace) | AGPL-3.0 | Express 5 + better-sqlite3, Svelte 5 PWA | Single container, 2 volumes | Capacitor Android app (local-only SQLite mode), Wear OS; no iOS app | Yes (+ Hevy, FitNotes, Jefit, Garmin FIT) | Closest architecturally. Young project; adds OIDC, coach sharing |
| [wger](https://github.com/wger-project/wger) + [Flutter app](https://github.com/wger-project/flutter) | AGPL-3.0, data CC-BY-SA | Django + PostgreSQL, REST `/api/v2` | Multi-container compose | Online-only Flutter client | No | Most mature; nutrition too. Main value: exercise DB |
| [Lyftr](https://github.com/Cawlumm/lyftr) | MIT | Go/Gin + SQLite; one Expo app for mobile + web | Compose, amd64/arm64/armv7 | — | planned | Same single React Native codebase idea |
| [GymMane](https://github.com/InlitX/GymMane) | GPL-3.0 + 7(b) attribution | Flutter, self-host web build | Dockerfile | Android app has no network permission; syncs through Syncthing | Yes many formats | Strong-like UX, body-map session generator |
| [workout.cool](https://github.com/Snouzy/workout-cool) | MIT | Next.js + Prisma + Postgres | Compose | Web only | No | Coaching/program platform rather than a logger |

## Mobile-first (impractical to self-host, or optional)

- **[Liftosaur](https://github.com/astashov/liftosaur)**: AGPL-3.0. The backend is AWS Lambda + DynamoDB, so self-hosting is impractical.
  - Worth taking: **Liftoscript**, a DSL for progression rules (5/3/1, GZCLP, etc.).
- **[LiftLog](https://github.com/LiamMorrow/LiftLog)**: AGPL-3.0. Expo app with an optional ASP.NET backend and an end-to-end-encrypted social feed. Local-first.
- **[Flex (formerly Flexify)](https://github.com/brandonp2412/Flexify)**: MIT. Flutter + Drift/SQLite, offline only, minimal Strong-like UX.
- **[Massive](https://github.com/brandonp2412/Massive)**: GPL-3.0. React Native; archived in Sep 2026 in favour of Flex.

## Not strength-focused

- **[Workout Tracker](https://github.com/jovandeginste/workout-tracker)**: MIT. Go, single binary/image, GPX/FIT data. A good model for single-binary packaging.
- **[FitTrackee](https://github.com/SamR1/FitTrackee)**: AGPL-3.0. GPS activities.

## Exercise datasets

| Dataset | License | Use in Open Workouts |
|---|---|---|
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | **Unlicense** (public domain), ~800 exercises with instructions and images | **Planned base dataset.** Merge into the built-in library via a script; keep our `Name (Equipment)` naming |
| [wrkout/exercises.json](https://github.com/wrkout/exercises.json) | Unlicense | Upstream of the above |
| [wger exercise DB](https://wger.de/api/v2/) | CC-BY-SA, per entry (`license`, `license_author`) | **Do not bundle** (share-alike conflicts with our non-commercial license). Ideas only |
| [Everkinetic](https://github.com/everkinetic/data) | CC-BY-SA-4.0 | **Do not bundle** (share-alike) |
| ExerciseDB / AscendAPI | Proprietary data (terms forbid storing it) | **Do not use** |
| openGym media (Gym Visual) | Licensed for openGym only | **Do not use** |

The built-in list in `packages/shared/src/exercises.ts` (185 exercises) was written for this project, so it carries no third-party licence obligations.

## License compatibility

Open Workouts is **source-available** under the PolyForm Noncommercial License 1.0.0 (see [LICENSING.md](../LICENSING.md)). That determines what we can take from the projects above:

- **Code or data under MIT, ISC, BSD, Apache-2.0 or Unlicense/public domain:** can be included. Keep their notices.
- **AGPL/GPL/LGPL code** (openGym, LiftTrace, wger, Liftosaur, LiftLog, GymMane, Massive): can't be copied in. Those licenses require derived work to stay under open-source terms, which a non-commercial license is not. They remain a source of **ideas** only: features, UX, protocol design.
- **CC-BY-SA data** (wger exercises, Everkinetic illustrations): don't bundle it. Share-alike would force those parts back under CC-BY-SA terms, which allow commercial use.
- **Gym Visual media, ExerciseDB data:** proprietary.

**Where code can come from:** in practice, our own original code plus permissively licensed libraries. That's also how the codebase was built so far. The best data source is **free-exercise-db** (public domain).

## What we take from each

- **openGym:** offline-first with server revisions; a broad set of importers.
- **LiftTrace:** a single container + SQLite + one data volume as the whole backup story; local-only mode on mobile; OIDC later.
- **Liftosaur:** programmable progression (roadmap).
- **Flex / GymMane:** a low-friction, Strong-style logging UX.
- **wger:** a clean REST resource model; multilingual exercise schema (roadmap).

## The gap Open Workouts fills

1. **A real database plus a single-container self-host plus an offline-first native app for iOS and Android.** No existing project combines all three.
2. **A documented sync protocol** that third-party clients can implement (see [ARCHITECTURE.md](ARCHITECTURE.md)).
3. **A focused, Strong-like UX** without scope creep (no AI coach or nutrition in the core).
4. **A tested import library** for Strong CSV (Hevy/FitNotes next) in `packages/shared`.
