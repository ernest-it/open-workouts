# Open Workouts: mobile app

The main frontend, built with Expo (SDK 58) / React Native. It uses the same offline-first `WorkoutStore` as the web UI, through `@open-workouts/shared`.

```bash
npm install
npx expo start            # Expo Go on a phone, or `a` / `i` for an emulator/simulator
npm run typecheck
npm run export:android    # verifies the production JS bundle
```

- **First launch:** connect to a server URL (LAN `http://` is allowed), or choose **local-only** mode.
- **Storage:**
  - Data is kept in on-device SQLite (`expo-sqlite/kv-store`).
  - The account token is kept in the OS keychain (`expo-secure-store`).
- **Sync triggers:** two seconds after a change, every minute, and whenever the app returns to the foreground.

**Building store/APK binaries** needs EAS (`npx eas build`) or a local `npx expo run:android` / `run:ios`. Neither is set up in CI yet.

**Expo changes quickly.** Use `npx expo install <pkg>` so versions match the SDK, and check the docs for the SDK version in `package.json` (see `AGENTS.md`).
