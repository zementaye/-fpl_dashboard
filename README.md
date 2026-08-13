# FPL Squad Dashboard

A self-hosted Fantasy Premier League dashboard: a tactical pitch view of your starting XI, per-player reasoning for every pick, a week-by-week best-XI planner, a chip-strategy timeline, live price/injury data pulled from the official FPL API, and an optional AI assistant for reacting to news mid-season.

It's a single Node/Express server serving a static dashboard — no database, no build step, deploys to [Render](https://render.com)'s free tier in a couple of minutes.

## Features

- **Tactical pitch diagram** — starting XI plotted on a pitch, click a player to jump to their card
- **Full squad breakdown** — price, projected points, and an expandable "why this pick" writeup per player, with underlying stats and risk flags
- **Weekly Best XI planner** — gameweek-by-gameweek captaincy and lineup reasoning based on fixtures
- **Chip strategy timeline** — Wildcard / Free Hit / Triple Captain / Bench Boost timing guidance
- **Transfer Contingency Board** — pre-planned "if this happens → do this" reactions for the squad's riskiest picks
- **Live FPL data** — server-side proxy to the official FPL API for real prices, injury status, and the next gameweek deadline, matched automatically against the squad
- **Editable squad** — update a player's name, price, or add a note directly in the UI, no code changes needed (saved locally in your browser)
- **AI Assistant** *(optional)* — a chat panel backed by Google Gemini that reasons about transfers and captaincy against the current squad, useful for reacting to injury news between updates
- **Optional password gate** — lock the whole site behind a single shared password

## Tech stack

- Node.js + Express (single server, serves the static frontend and two small API routes)
- Vanilla HTML/CSS/JS on the frontend — no build step, no framework
- [Official FPL API](https://fantasy.premierleague.com/api/bootstrap-static/) for live data
- [Google Gemini API](https://ai.google.dev/) for the optional AI assistant

## Project structure

```
.
├── public/
│   └── index.html      # the dashboard itself — data, layout, and logic all in one file
├── server.js            # Express server: static hosting + /api/fpl-data + /api/assistant
├── package.json
└── render.yaml           # lets Render auto-configure the service
```

## Running locally

```
npm install
npm start
```

Then open `http://localhost:3000`. The live FPL data and squad editing work out of the box with no setup; the AI Assistant needs an API key (see below).

## Deploying to Render

1. Fork or clone this repo.
2. On [render.com](https://render.com): **New +** → **Web Service** → connect your repo.
3. Render should auto-detect everything from `render.yaml`. If not, set manually:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Deploy. It'll be live at `https://<your-service-name>.onrender.com` within a minute or two.

Any other Node-friendly host (Railway, Fly.io, Vercel, a VPS) works the same way — the app is a standard Express server, nothing Render-specific about it.

## Environment variables

Both are optional — the dashboard runs with neither set, just with the AI Assistant and password gate disabled.

| Variable | Required for | How to get one |
|---|---|---|
| `GEMINI_API_KEY` | The AI Assistant panel | Free at [aistudio.google.com](https://aistudio.google.com) — sign in, **Get API key** → **Create API key**, no credit card |
| `SITE_PASSWORD` | Locking the site behind a login prompt | Any string you choose — set it directly as the env var value |

Set these under your host's environment/secrets settings (e.g. Render → your service → **Environment** tab). `GEMINI_API_KEY` never reaches the browser — `server.js` keeps it server-side behind a `/api/assistant` route.

## Customizing the squad

Squad data lives in the `PLAYERS` array near the bottom of `public/index.html` — prices, projected points, and the reasoning text for each pick. Edit it directly and redeploy, or use the in-app **Edit** button on each card for quick changes without touching code (saved to that browser's local storage — not synced across devices, and doesn't propagate to the pitch diagram or Weekly XI panels, which are hand-written per gameweek).

## How the live data works

`server.js` proxies the official FPL bootstrap-static endpoint (browsers get blocked by CORS calling it directly), matches players by name + team against the hardcoded squad, and caches the result for 10 minutes. If a player can't be matched or the API is briefly unavailable, the dashboard falls back to its static estimates silently — nothing breaks.

## License

No license specified — treat as a personal project template. Fork and adapt freely.
