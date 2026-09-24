# DailyDo (Vercel edition)

Hierarchical template-based daily task tracker. Originally built on Replit; this fork hosts on **Vercel** with **Google OAuth** login and **Neon Postgres**.

## Stack
- Frontend: React + Vite + Tailwind + Shadcn UI
- Backend: Express (single Vercel serverless function at `api/index.ts`)
- DB: Neon Postgres via `@neondatabase/serverless` + Drizzle ORM
- Auth: Google OAuth 2.0 (Passport `passport-google-oauth20`) with PG-backed sessions
- Sheets: Reuses the user's Google login (Sheets scope) for deadline sync

## Local development

```bash
cp .env.example .env   # then fill in DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID/SECRET
npm install
npm run db:push        # creates tables in DATABASE_URL
npm run dev            # http://localhost:5000
```

`npm run dev` runs the Express server with Vite middleware. The Google OAuth callback URL for local dev is `http://localhost:5000/api/callback` — make sure that's added in your Google Cloud OAuth client.

## Deploying to Vercel

See [`docs/SETUP.md`](docs/SETUP.md) for full step-by-step setup (Google Cloud, Neon, Vercel).

Short version:
1. Push this repo to GitHub.
2. Import into Vercel — it picks up `vercel.json`.
3. Add Vercel Postgres / Neon integration and copy `DATABASE_URL` into env vars.
4. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` env vars.
5. Add the production callback URL `https://<your-domain>/api/callback` in Google Cloud OAuth client.
6. After first deploy, run `npm run db:push` against the production DB to create tables.
