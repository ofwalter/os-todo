# Setup Guide — DailyDo on Vercel

This is the one-time setup to get DailyDo running on Vercel with Google OAuth and Neon Postgres.

## 1. Google Cloud — OAuth client

1. Open <https://console.cloud.google.com/>.
2. Create a new project (e.g. `DailyDo`) or pick an existing one.
3. **APIs & Services → Library → enable "Google Sheets API"**.
4. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: `DailyDo`. Support email: your email.
   - Scopes: add `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`, and **`https://www.googleapis.com/auth/spreadsheets`**.
   - Test users: add your own Google account (until the app is verified).
   - Save & continue.
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `DailyDo Web`.
   - Authorized redirect URIs:
     - `http://localhost:5000/api/callback` (local dev)
     - `https://<your-vercel-domain>/api/callback` (after first Vercel deploy — come back and add this)
   - Save. Copy the **Client ID** and **Client secret**.

## 2. Neon Postgres (via Vercel)

1. In Vercel, open your project (after creating it in step 3) → **Storage → Create database → Neon (Postgres)**.
2. Pick a region (close to your users). Connect it to the project.
3. Vercel auto-injects `DATABASE_URL` (and a couple of `POSTGRES_*` aliases) as env vars.
4. Locally, you can grab the same `DATABASE_URL` from Neon's console (use the **pooled** connection string for serverless).

## 3. Vercel project

1. Push this repo to GitHub.
2. In Vercel → **Add New → Project → Import** the repo.
3. Framework preset: **Other** (the `vercel.json` already configures the build).
4. Build command: `npm run build` (already set in `vercel.json`). Output dir: `dist/public`.
5. Add environment variables (Production + Preview):
   - `DATABASE_URL` — set automatically by the Neon integration if you used it; otherwise paste manually.
   - `SESSION_SECRET` — long random string. `openssl rand -hex 32` works.
   - `GOOGLE_CLIENT_ID` — from step 1.
   - `GOOGLE_CLIENT_SECRET` — from step 1.
   - `APP_URL` — `https://<your-domain>` (no trailing slash). Optional; falls back to `VERCEL_URL`.
6. Deploy.

## 4. Initialize the database schema

Once deployed (or before, if you have the prod `DATABASE_URL` locally):

```bash
DATABASE_URL="<prod-url>" npm run db:push
```

This creates: `users`, `task_templates`, `daily_tasks`, `holidays`, `user_settings`, `custom_streaks`, `custom_streak_entries`, `sessions`.

## 5. Add the production callback URL

After Vercel gives you a domain (e.g. `dailydo.vercel.app`):
- Back in Google Cloud → OAuth client → add `https://dailydo.vercel.app/api/callback` to authorized redirect URIs.
- If you add a custom domain later, add that callback URL too.

## 6. Local development

```bash
cp .env.example .env
# fill in DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
# APP_URL=http://localhost:5000
npm install
npm run db:push
npm run dev
```

Visit <http://localhost:5000>, click Login, sign in with Google.

## Troubleshooting

- **"redirect_uri_mismatch"**: the callback URL doesn't match what's registered in Google Cloud. Check `APP_URL` and the Authorized redirect URIs list.
- **"Google account is not connected for Sheets"**: log out and log back in to grant the Sheets scope (we ask for it on every login with `prompt: consent`).
- **No edit permission on spreadsheet**: the Google account you logged in with must have edit access to the sheet you've configured in Settings.
- **Session not persisting**: make sure the `sessions` table exists (`npm run db:push`) and `SESSION_SECRET` is set.
