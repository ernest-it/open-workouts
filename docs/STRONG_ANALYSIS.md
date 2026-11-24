# Strong: feature teardown

This document lists what the Strong workout tracker (iOS/Android, strong.app) does. It is the reference for building Open Workouts's own **original** implementation.

> **Scope and ethics.** This analysis uses only public material: the Strong help centre, store listings, third-party reviews, and open-source parsers of Strong's CSV export. Strong's app binary and private API were **not** decompiled or reverse engineered.
>
> We reuse no Strong name, branding, artwork or exercise media. Interoperability comes through the user's own CSV export.
>
> Note that one developer was asked by Strong to take down an unofficial API client (`dmzoneill/strongapp-api`). Don't build on Strong's private API.

**Confidence tags:**
- **[help]**: the Strong help centre, as quoted in search results (the pages themselves blocked automated fetches).
- **[3p]**: a third-party review.
- **[code]**: confirmed in open-source parser code or a real export file.
- **[unverified]**: needs checking in the app.

---

## 1. Live workout logging (the core loop)

| Feature | Strong behaviour | Open Workouts status |
|---|---|---|
| Start a workout | Start empty, or start from a template [help] | Yes: both |
| Set table | Columns: Set # · Previous · kg/lb · Reps · ✓ [3p] | Yes |
| "Previous" column | Shows the same set from the last time you did the exercise [3p] | Yes: new sets are pre-filled from the last session; tap to copy (mobile) |
| Set types | Warm-up (W), Drop (D), Failure (F), normal [help/code] | Yes: tap the set number to cycle the type |
| RPE | Per set; Strong's help uses 6–10, with a reps-in-reserve table (`/article/230-about-rpe`) [help] | Yes: 6–10 in 0.5 steps (schema allows 1–10) |
| Rest timer | Starts automatically when a set is completed. Default 2:00; separate warm-up and working durations; sound, full-screen mode; can be disabled (`/article/231-rest-timer`) [help] | Yes: auto-start, per-exercise override, ±15 s, skip, vibration. Planned: separate warm-up timer, background notification |
| Supersets | Created from the exercise "…" menu; exercises grouped and done alternately (`/article/98`) [help] | Partial: in the data model (`supersetId`), no UI yet |
| Notes | Per exercise and per workout [code] | Yes |
| Workout duration | Timer from the start of the session [help] | Yes |
| Edit past workouts | From History [unverified] | Yes |
| Discard incomplete sets on finish | [unverified] | Yes: with a confirmation |

## 2. Exercise model

**Strong's exercise types and the fields each records** [3p + unverified]:

| Strong type | Fields | Open Workouts `logType` |
|---|---|---|
| Barbell / Dumbbell / Machine-Other | weight × reps | `weight_reps` (equipment is a separate field) |
| Weighted Bodyweight | +weight × reps | `weighted_bodyweight` |
| Assisted Bodyweight | −weight × reps | `assisted_bodyweight` |
| Reps Only | reps | `reps` |
| Cardio | distance + time | `distance_duration` |
| Duration | time | `duration` |

- **Naming:** names put the equipment in parentheses, e.g. "Bench Press (Barbell)" or "Triceps Pushdown (Cable - Straight Bar)" [code].
  - Our built-in library uses the same convention, so imports match automatically.
- **Body parts:** Core, Arms, Back, Chest, Legs, Shoulders, Other, Olympic, Full Body, Cardio [unverified].
- **Library size:** 450+ exercises; users can create custom exercises [3p/help].
- **Exercise detail tabs:** About · History · Charts · Records (`/article/237`) [help].
- **Complaints:** types can't be converted after creation, and some combinations aren't allowed (weight + time) [3p].
  - **Our approach:** `logType` is an editable field on custom exercises.

## 3. Templates

- Templates (routines) can be grouped in folders [help].
- Strong ships example templates.
- Templates can be shared as a link.
- The **free tier is limited to 3 templates**.
  - Open Workouts: unlimited templates, folders, and saving a workout as a template are supported. Sharing is planned.

## 4. Records & PRs

- **Estimated 1RM:** Strong uses the **Brzycki** formula, `1RM = w × 36 / (37 − reps)`. It notes that the estimate breaks down above ~12 reps (`/article/133-1rm`) [help].
  - Implemented in `packages/shared/src/calc.ts`; Epley, Lombardi, Mayhew, O'Conner and Wathan are also available.
- **Records tab:** estimated 1RM, max weight, and max volume (weight × reps in one set), each with history.
  - A rep-records table covers **1–12 reps**: the best actual weight next to a value *predicted* from the best e1RM (`/article/216`) [help]. Both are implemented.
- **History:** each workout shows a PR count [3p]. We also compute PRs per set (repeats within a session don't count twice).

## 5. History, charts, profile

- **History:** a list showing time, total weight and PR count, plus a calendar [3p]. Implemented.
- **Exercise charts:** best set (e1RM), volume and more [3p]. Implemented: e1RM, max weight, volume, max reps.
- **Profile dashboard:** widgets can be reordered; "Workouts per week" has a goal; any exercise or measurement chart can be added (`/article/239`) [help].
  - Implemented: workouts/week and body weight. Planned: configurable widgets and goals.
- iOS home-screen widgets (calendar/streak, activity) [3p]. Planned.

## 6. Measurements (`/article/238`) [help]

- **Core:** Weight, Body Fat %, Caloric Intake. These sync with Apple Health.
- **Body parts** (PRO only in Strong): Neck, Shoulders, Chest, L/R Bicep, L/R Forearm, Upper Abs, Waist, Lower Abs, Hips, L/R Thigh, L/R Calf.
- All of them are in `MEASUREMENT_KINDS`, free.

## 7. Tools

| Tool | Strong | Open Workouts |
|---|---|---|
| Plate calculator | PRO only (`/article/169`) | Yes: free; bar weight is configurable; planned: custom plate inventory in the UI (supported by `calculatePlates`) |
| Warm-up calculator | PRO only; barbell, dumbbell and machine (`/article/171`) | Yes on the web; planned on mobile |
| Units | kg/lb, km/mi | Yes: stored in SI units, converted at the display layer |

## 8. CSV export format (interoperability)

- **Where:** Settings → "Export Strong Data" (iOS) or "Export Data" (Android).
- **Strong cannot re-import its own CSV.** Our importer can, and the import is **idempotent**: IDs are derived from file contents, so importing the same file twice doesn't duplicate anything.

**General rules (all variants):**
- One row per set.
- Workout fields are repeated on every row.
- `Date` is the workout start in local time, with no time zone.
- `Set Order` restarts at 1 for each exercise.
- Fields are quoted with `""` escapes; values can contain newlines; a BOM may be present.
- Unused numbers are written as `0`.

**Variants handled by `packages/shared/src/strong.ts`:**

1. **Classic, comma-delimited** [code: real 1,903-row export]:
   ```
   Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
   2020-12-30 18:51:52,"Evening Workout",2h 38m,"Snatch (Barbell)",1,40.0,3,0,0,"","",
   ```
   - The weight unit isn't in the file, so the user picks it at import time.
2. **Older semicolon-delimited, with `Weight Unit` / `Distance Unit` columns** [code].
3. **Newer semicolon-delimited, with units in the headers** [code: openGym importer]:
   ```
   Workout #;Date;Workout Name;Duration (sec);Exercise Name;Set Order;Weight (kg);Reps;RPE;Distance (meters);Seconds;Notes;Workout Notes
   ```
   - Header units such as `(kg)`, `(lbs)`, `(sec)` and `(meters)` are honoured.

**Also handled:**
- `Set Order` values: `1..N`, `W`, `D`, `F`, plus non-set rows (`Rest Timer`, which is skipped, and `Note`, whose text is attached to the exercise).
- Durations like `1h 5m`, `45m` or `1:05:00`.
- Localised English dates such as `22 Dec 2025, 08:00`.

**Not handled yet:** dates localised to other languages (e.g. `21 août 2024`). Workaround: export with the app set to English, which is also Hevy's advice.

**Never in any Strong export:** superset grouping, or the rest duration between sets. The separate measurements export (`Date, Measurement Type, Value, Unit, Source`) is planned.

**Our export** (`GET /api/v1/export/strong.csv`) writes the classic comma format. That's the variant most other apps (Hevy, etc.) accept.

## 9. Platform, accounts, pricing

- **Accounts:** a Strong account plus "Strong Cloud" sync; no public API, no web app (teased, not shipped) [help/3p].
- **Integrations:** Apple Health (full sync) and Apple Watch (live logging) [help].
  - Android uses Health Connect (6.0, beta); there's no Wear OS app [help/3p].
- **Free tier:** unlimited workouts, 3 templates.
- **PRO** unlocks unlimited templates, body-part measurements, all charts, the plate and warm-up calculators, and themes.
  - About $4.99/month, $29.99/year, or $79.99–$99.99 lifetime [3p].

## 10. Common complaints → our differentiators

| Complaint | Open Workouts answer |
|---|---|
| Template limit and calculators locked behind a paywall | Everything is free; you own the server |
| No web app | The web UI ships in the same container |
| No import (not even of Strong's own export) | Strong CSV import (3 variants), idempotent |
| Lossy export | Full JSON backup + Strong-compatible CSV |
| No public API | Documented REST and sync API; API tokens |
| Rigid exercise types | Editable `logType`; equipment kept as a separate field |
| Android lags behind iOS; no Wear OS | One React Native codebase for both. Wear OS/watchOS planned |
| No progression or programming | On the roadmap: progression rules, programs |
| Your data sits on someone else's cloud | Self-hosted (Docker, Kubernetes, Proxmox LXC), or local-only mode in the app |

## Sources

- Strong help centre: `help.strongapp.io/article/` 97, 98, 105, 132, 133, 143, 147, 169, 171, 216, 224, 229, 230, 231, 235, 237, 238, 239, 254.
- Reviews:
  - repreturn.com/strong-app-review
  - thenerdystudent.com/2021/08/strong-review
  - prpath.app/blog/strong-app-review-2026.html
  - aitoolsbakery.com/blog/strong-app-review
  - dr-muscle.com/strong-app-review-alternative
- CSV references:
  - github.com/AlexandrosKyriakakis/StrongAppAnalytics (real export)
  - github.com/edvanbeinum/StrongCsvParser
  - github.com/nickdeis/strong-csv-to-sqlite
  - github.com/smyrick/sugarwod-to-hevy (docs/STRONG_FORMAT.md)
  - github.com/DuarteSantos8/openGym (frontend/src/lib/import-csv.js)
  - github.com/csmithburks/lift-log
