# Notices

Required Notice: Copyright (c) 2026 ernest-it

Open Workouts is licensed under the PolyForm Noncommercial License 1.0.0 (see
[LICENSE](LICENSE) and the plain-English summary in [LICENSING.md](LICENSING.md)).

## Third-party software

Open Workouts is built on open-source libraries that stay under their own
licenses. Each build generates the full list of production dependencies, with
their license texts:

- The **server and web UI** list is served at `/third-party-notices.txt` on every
  server and included in the Docker image (`npm run notices`).
- For the **mobile app**, run `node scripts/third-party-notices.mjs apps/mobile`.

At the time of writing, those dependencies use the following licenses, all of
which allow inclusion in this project with their notices kept:
- MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0 and Unlicense
- MPL-2.0 (lightningcss, a build tool)
- Python-2.0 (argparse)
- CC-BY-4.0 (caniuse-lite browser data)
- node-forge, under the BSD-3-Clause option of its dual license

Placeholder icons and splash images in `apps/mobile/assets` come from the Expo
project template (MIT, © 650 Industries, Inc.).

## Exercise data

The built-in exercise library was written for this project. Any dataset added
later must be public domain or permissively licensed, and is credited here.

## Trademarks

"Strong" is a trademark of its owner. Open Workouts is not affiliated with or
endorsed by Strong Fitness PTE; the name is used only to describe compatibility
with Strong's CSV export.
