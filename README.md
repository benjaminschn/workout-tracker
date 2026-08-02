# Workout Tracker

A touch-first, offline-capable workout tracker designed for installation on an
iPhone Home Screen.

## Features

- Custom and template-guided workouts
- Rep ranges, per-set RIR, kilogram weights, and rest timers
- RIR-aware double progression with transparent next-weight recommendations
- Previous-two-session hints and estimated-strength progress charts
- Individually deletable templates and recorded workouts
- Private on-device IndexedDB storage
- JSON and CSV exports
- Installable PWA with offline app-shell caching

## Development

```bash
npm install
npm run dev
```

Run the checks before publishing:

```bash
npm test
npm run lint
npm run build:pages
```

## Deployment

**GitHub Pages is the only deployment target for this project.**

- Push changes to `main` on `https://github.com/benjaminschn/workout-tracker`.
- The `Deploy Workout Tracker to GitHub Pages` workflow publishes the site to
  `https://benjaminschn.github.io/workout-tracker/`.
- Confirm that workflow succeeds after every deployment.
- Do not deploy this project with OpenAI Sites or another hosting provider.
- Do not create or restore `.openai/hosting.json`; it is intentionally ignored.

`npm run build` remains available as a Cloudflare-compatible build check, but it
is not the deployment path. The static GitHub Pages build is created with
`npm run build:pages`.

Workout data never enters this repository or a hosted database. Each browser or
installed PWA keeps its own records on the device.
