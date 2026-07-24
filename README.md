# Workout Tracker

A touch-first, offline-capable workout tracker designed for installation on an
iPhone Home Screen.

## Features

- Custom and template-guided workouts
- Sets, reps, kilogram weights, and rest timers
- Easy, medium, hard, and failed exercise ratings
- Previous-two-session hints and exercise progress charts
- Private on-device IndexedDB storage
- JSON and CSV exports
- Installable PWA with offline app-shell caching

## Development

```bash
npm install
npm run dev
```

The Cloudflare-compatible production build is created with `npm run build`.
The static GitHub Pages build is created with `npm run build:pages`.

Workout data never enters this repository or a hosted database. Each browser or
installed PWA keeps its own records on the device.
