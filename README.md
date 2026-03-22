# VocalCoach — Your Personal Singing Coach

A web app that helps you practice singing by recording your voice, analyzing pitch and loudness, and giving you tailored drills and AI coaching.

## Features

- **Song Management** — Add songs and mark specific hooks/lines to practice
- **Voice Recording** — Record via browser mic with countdown timer
- **Pitch Analysis** — Real-time autocorrelation pitch detection with visual graph (green = on pitch, red = off)
- **Loudness Analysis** — Energy/loudness curve visualization
- **Drill Suggestions** — Tailored drills based on your recording analysis (pitch loops, energy sustain, breath control)
- **Progress Tracking** — Track improvement over time for each line
- **AI Coach Chat** — Context-aware coaching powered by Claude (Anthropic) using plain, non-technical language

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Express, SQLite (better-sqlite3), Drizzle ORM
- **Audio:** Web Audio API (autocorrelation pitch detection, loudness analysis)
- **AI:** Anthropic Claude SDK for coaching chat

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key for the AI coach chat feature |
| `PORT` | No | Server port (defaults to 5000) |

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Deploy on Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub Repo
3. Select this repository
4. Add environment variable: `ANTHROPIC_API_KEY` = your Anthropic API key
5. Railway will auto-detect the config and deploy

## Notes

- All audio processing happens locally in the browser — no audio data is sent to the server
- The AI coach chat sends only text metrics and context to Claude, not raw audio
- SQLite database is stored on disk; Railway provides persistent storage
