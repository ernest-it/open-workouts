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

**Release builds** come from `.github/workflows/release.yml` on every `v*` tag, attached to the GitHub release:

- **Android:** a release APK, signed with the release key from the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` repository secrets. Keep that key: Android only installs updates signed with the same key.
- **iOS:** an unsigned `.ipa` (re-sign it with AltStore, Sideloadly or your own Apple developer account) and a simulator build. The workflow also launches the app on the smallest and largest iPhone simulators and keeps screenshots.

Run the workflow by hand (Actions → Release → Run workflow) to build and test without publishing. Bump `version`, `android.versionCode` and `ios.buildNumber` in `app.json` for each release.

**Building on Windows:** the native Android build exceeds the 260-character path limit unless long paths are enabled. Build in WSL/Linux, or enable long paths.

**Expo changes quickly.** Use `npx expo install <pkg>` so versions match the SDK, and check the docs for the SDK version in `package.json` (see `AGENTS.md`).
