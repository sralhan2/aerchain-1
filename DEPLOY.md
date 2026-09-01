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

## 2. Set the one required environment variable

Whichever path you use, the app needs your Anthropic API key set as an env var on the Vercel project — it's read from `process.env.ANTHROPIC_API_KEY` and is **not** committed to the repo (it only ever lived in your local `.env.local`, which is gitignored).

- Dashboard: Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (Production + Preview) → redeploy.
- CLI: `vercel env add ANTHROPIC_API_KEY` (paste the key when prompted), then `vercel --prod` again to pick it up.

## 3. What to expect once it's live

- `/` — the RFx co-pilot (draft screen)
- `/inbox` — the vendor inbox; click "Run extraction on all responses" to trigger the real extraction pipeline live
- `/comparison` — the comparison grid, populated once extraction has run

**One honest limitation, worth knowing before the Aerchain team clicks around:** the app stores its working data (extraction results) in a SQLite file in Vercel's `/tmp`, which does not persist across cold starts or between separate serverless instances. In practice this means: if the app has been idle for a while and a new instance spins up, `/comparison` may show as empty again until someone re-runs extraction from `/inbox`. This is a deliberate, disclosed tradeoff for a demo (see the one-pager) — a production version would use a real hosted database (Postgres) instead. If you want that fixed before the demo, say so and I'll wire up a hosted Postgres (e.g. Vercel Postgres or Supabase) instead of SQLite — it's a contained change.

## 4. Local dev, if you want to keep iterating here first

```
npm install
npm run dev
```
`.env.local` already has your API key from this session. `data/app.db` is the local dev database (gitignored, regenerates automatically).
