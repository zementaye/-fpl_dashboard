# FPL Dashboard — Render Deploy

Render only deploys from a Git repo, not a direct file upload — so the fastest path is:

## Option A: GitHub → Render (recommended, ~2 min)

1. Unzip this folder locally.
2. Create a new **public** GitHub repo and push these files to it:
   ```
   git init
   git add .
   git commit -m "FPL dashboard"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. Go to [render.com](https://render.com) → **New +** → **Web Service**.
4. Connect the repo you just pushed.
5. Render should auto-detect the settings from `render.yaml`. If not, set manually:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Click **Create Web Service**. Your dashboard will be live at `https://<your-service-name>.onrender.com` in a minute or two.

## Option B: Skip GitHub — GitLab/Bitbucket work the same way

Render also connects to GitLab and Bitbucket repos if you don't want to use GitHub — same steps as above.

## What's in here

- `public/index.html` — the dashboard itself (pitch diagram, squad cards, chip roadmap)
- `server.js` — tiny Express server that serves the static file
- `package.json` — dependencies (just Express)
- `render.yaml` — lets Render auto-configure the service from this file

## Updating the data later

All the squad data lives in the `PLAYERS` array near the bottom of `public/index.html` — edit prices, projected points, or the `why` text there, push the change to your repo, and Render will auto-redeploy.

## Setting up the AI Assistant

The dashboard includes an "Ask" panel that calls Google Gemini to react to injury news, transfers, or bad gameweeks against your actual squad — Gemini's free tier (no credit card required) is enough to run this. To make it work on your deployed Render service:

1. Go to [aistudio.google.com](https://aistudio.google.com), sign in with a Google account, and click **Get API key** → **Create API key**. No credit card needed.
2. In your Render dashboard, open your web service → **Environment** tab.
3. Add an environment variable: **Key** = `GEMINI_API_KEY`, **Value** = your key.
4. Save — Render will automatically redeploy with the key available.

The key never touches the browser — `server.js` keeps it server-side and only exposes a `/api/assistant` endpoint that the page calls. Without this step, the Ask panel will show a clear error explaining the key is missing rather than failing silently.

Google's free tier has rate limits (requests per minute/day) — plenty for personal use, but if you hit a 429 error, wait a minute and try again.

If you'd rather skip API keys entirely, the **Transfer Contingency Board** section covers the most likely "what if" scenarios (injuries, role changes, chip timing) without needing the AI panel at all.

## Live FPL prices, injuries, and deadline

The dashboard automatically pulls live data from the official public FPL API on every page load — no setup, no API key needed for this part. It shows:

- A green "live" dot + how many of your 15 squad players it successfully matched
- A **live price tag** on each card if the official price differs from the estimate baked into the dashboard
- A red **status flag** on any player who's flagged doubtful/injured/suspended in the official data, with the injury news text
- A **deadline countdown chip** for the next gameweek

This is fetched server-side (browsers get blocked by CORS hitting the FPL API directly) and cached for 10 minutes to avoid hammering it. If the FPL API is briefly down or a player can't be matched by name, the dashboard just falls back to showing the static estimate — nothing breaks.

## Editing your squad without touching code

Every player card has an **Edit** button — change the name, price, or add a note (e.g. "swapped for X after the injury"), and it's saved automatically. An "edited" badge appears on any player you've changed, and a **Reset all edits** button appears above the squad grid once you've made any changes.

**Important scope note:** edits update the squad card display and get shared with the AI Assistant (so you can just tell it "I already swapped Szoboszlai for X" and it'll know). They do **not** automatically update the pitch diagram or the Weekly Best XI panels — those are hand-written for each gameweek, so a swap there still needs a manual edit to `public/index.html` if you want it reflected there too.

**Storage note:** edits and chat history are saved in your browser's local storage, not on the server — they're private to you but tied to that specific browser/device. Clearing your browser data will reset them, and they won't show up if you open the dashboard on a different device.

## Password-protecting the site

By default your Render URL is public — anyone with the link can view your squad and use your AI Assistant (burning your Gemini quota). To lock it down:

1. In Render: your service → **Environment** tab.
2. Add an environment variable: **Key** = `SITE_PASSWORD`, **Value** = whatever password you want.
3. Save — Render redeploys automatically.

Visiting the site will now show your browser's native login prompt. The username can be anything; only the password is checked. Leave `SITE_PASSWORD` unset if you'd rather keep the site open.
