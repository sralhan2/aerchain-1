# Deploying RFx Copilot to Vercel

## 1. Push to GitHub (or deploy directly from the CLI)

**Option A — GitHub + Vercel dashboard (recommended, easiest):**
1. Create a new empty repo on GitHub.
2. From this project folder:
   ```
   git remote add origin <your-repo-url>
   git add .
   git commit -m "RFx copilot prototype"
   git push -u origin main
   ```
3. Go to vercel.com → New Project → import that repo. Framework preset (Next.js) is auto-detected.

**Option B — CLI only, no GitHub:**
```
npm install -g vercel
vercel login
vercel --prod
```
Follow the prompts (link to a new project, defaults are fine).

## 2. Set the required environment variable(s)

**`ANTHROPIC_API_KEY` (required):** the app needs your Anthropic API key set as an env var on the Vercel project — it's read from `process.env.ANTHROPIC_API_KEY` and is **not** committed to the repo (it only ever lived in your local `.env.local`, which is gitignored).

- Dashboard: Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (Production + Preview) → redeploy.
- CLI: `vercel env add ANTHROPIC_API_KEY` (paste the key when prompted), then `vercel --prod` again to pick it up.

**`POSTGRES_URL` (required for extraction results to persist — see below):** Vercel's serverless functions have a read-only filesystem except `/tmp`, and `/tmp` does not survive across cold starts or separate instances. Without a real database, the Inbox's "Run extraction" can succeed while the Comparison page — a different request, possibly a different instance — reads back nothing. To fix this:

1. In the Vercel dashboard, open your project → **Storage** tab → **Create Database** → choose **Postgres** (Neon-backed).
2. Connect it to this project — Vercel injects `POSTGRES_URL` (and related vars) automatically.
3. Redeploy. The app detects `POSTGRES_URL` and switches to it automatically (see `src/lib/store.ts`) — no code changes needed.

This takes about a minute and doesn't require a separate account since it's built into Vercel. Without it, the app still works, but extraction results can intermittently vanish between page loads — not something you want the Aerchain team hitting live.

## 3. What to expect once it's live

- `/` — the RFx co-pilot (draft screen)
- `/inbox` — the vendor inbox; click "Run extraction on all responses" to trigger the real extraction pipeline live
- `/comparison` — the comparison grid, populated once extraction has run

## 4. Local dev, if you want to keep iterating here first

```
npm install
npm run dev
```
`.env.local` already has your API key from this session. `data/app.db` is the local dev database (gitignored, regenerates automatically).
