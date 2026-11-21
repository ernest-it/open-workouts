# Open Workouts

**A free, source-available, self-hostable strength training tracker.** Log workouts on your phone and keep the data on your own server.

The model is the fast "templates → live workout → history and PRs" loop that apps like Strong popularised. Open Workouts has no paywalls and no template limits, and it imports your existing Strong history.

- 📱 **Mobile app (iOS + Android, Expo/React Native): the main frontend.**
  - Offline-first; syncs whenever it can reach your server.
  - Also works in local-only mode with no server.
- 🌐 **Web UI** served by the same container: log, review and import from any browser.
- 🐳 **One container, one SQLite file.** Runs on Docker Compose, Kubernetes, or a Proxmox LXC.
- 🔁 **Import and export** on mobile and web. Imports Strong CSVs (all three export variants). Exports a Strong-compatible CSV that imports back without duplicates, and a full JSON backup (workouts, templates, measurements and settings) that restores on any device.
- 🎨 **Themes.** Light, dark and pure-black modes, eight accent colours, or any custom colour. Text contrast adjusts automatically so every choice stays readable.
- ✨ **AI insights (optional).** The AI part is optional:
  - **Built in:** weekly training updates pushed to your phone, "compare with previous workout", and questions about your training. Uses Claude or a local model (Ollama).
  - **Your own assistant:** Claude Desktop, Claude Code or another AI assistant can read your log through the built-in MCP server.

<p align="center">
  <img src="docs/screenshots/android/03-active-workout.png" width="200" alt="Live workout">
  <img src="docs/screenshots/android/07-workout-detail.png" width="200" alt="Workout with PRs">
  <img src="docs/screenshots/android/10-exercise-chart.png" width="200" alt="Progress chart">
  <img src="docs/screenshots/android/dark-history.png" width="200" alt="History in dark mode">
</p>

<p align="center"><a href="docs/SCREENSHOTS.md">More screenshots: every screen of the app and the web UI</a></p>

## Features

| | |
|---|---|
| **Live workout logging** | "Previous" column, warm-up/drop/failure sets, RPE, notes, auto-starting rest timer, plate calculator, warm-up calculator |
| **Templates** | Unlimited, with folders; save any workout as a template |
| **Records** | Estimated 1RM (Brzycki), max weight, max set and session volume, rep records 1–12 with predictions, PR badges per set |
| **History & charts** | Calendar, per-workout summaries, per-exercise history and progress charts, workouts per week |
| **Measurements** | Body weight, body fat, calories, 15 body circumferences |
| **Exercises** | 185 built-in, plus custom exercises (weight × reps, ± bodyweight, reps only, duration, cardio) |
| **AI insights** | Weekly reports with ntfy/Discord notifications, workout comparisons, Q&A, plateau detection; Claude or local LLMs; MCP server for your own assistant. See [docs/AI_INSIGHTS.md](docs/AI_INSIGHTS.md) |
| **Multi-user** | Accounts, per-device tokens you can revoke, API tokens, first user becomes admin |

## Quick start

```bash
git clone https://github.com/ernest-it/open-workouts.git && cd open-workouts
docker compose up -d
# open http://<host>:8080 and create your account
```

Then install the app from the [latest release](https://github.com/ernest-it/open-workouts/releases/latest) and enter `<host>:8080`, or your HTTPS domain if you expose it:

- **Android:** download and install the `.apk`.
- **iOS:** sideload the unsigned `.ipa` with AltStore or Sideloadly. There is no App Store build yet.

Prebuilt server images are at `ghcr.io/ernest-it/open-workouts:latest` (amd64 and arm64). For Kubernetes, Proxmox, reverse proxies and backups, see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Development

Requires Node 22+.

```bash
npm install
npm test                 # shared + server test suites
npm run dev:server       # API on :8080 (tsx watch, data in ./data)
npm run dev:web          # web UI on :5173, proxies /api to :8080

cd apps/mobile && npm install
npx expo start           # scan the QR code with Expo Go, or press a / i for emulators
```

In the app, point it at your dev server's LAN IP, e.g. `http://192.168.1.20:8080`.

## Documentation

- [docs/STRONG_ANALYSIS.md](docs/STRONG_ANALYSIS.md): feature teardown of Strong (from public sources), the CSV format, and how we compare
- [docs/ALTERNATIVES.md](docs/ALTERNATIVES.md): survey of open-source trackers and exercise datasets; licensing notes
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, sync protocol, REST API
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Docker, Kubernetes, Proxmox, HTTPS, backups
- [docs/AI_INSIGHTS.md](docs/AI_INSIGHTS.md): LLM reports, weekly updates, MCP setup
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [SECURITY.md](SECURITY.md): running a server safely, reporting vulnerabilities

## License

Open Workouts is **source-available** under the [PolyForm Noncommercial License 1.0.0](LICENSE).

- **Free for any non-commercial use:** use the app, self-host your own server, change the code, and share it non-commercially.
- **Commercial use needs a separate license.** That covers selling it, paid hosting, or using it to run a business.
- **A paid hosted sync service** is offered by the copyright holder for people who don't want to self-host.

See [LICENSING.md](LICENSING.md) for a plain-English summary, [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor agreement, and [NOTICE.md](NOTICE.md) for third-party licenses.

Open Workouts is an independent project, not affiliated with or endorsed by Strong Fitness PTE. "Strong" is used only to describe import/export compatibility.
