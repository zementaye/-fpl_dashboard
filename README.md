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
