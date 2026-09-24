# Setup Guide — os-todo on Vercel

One-time setup to get os-todo running on Vercel with Neon Postgres.

## 1. Pick a password

```bash
npm install
npm run hash-password -- "your password"
```

Copy the whole `scrypt$...` line it prints. That's `APP_PASSWORD_HASH`. The plain password is never stored anywhere.
To change the password later, generate a new hash and replace the env var.

## 2. Vercel project

1. Push this repo to GitHub.
2. In Vercel → **Add New → Project → Import** the repo.
3. Framework preset: **Other** (the `vercel.json` already configures the build).
4. Build command: `npm run build` (already set in `vercel.json`). Output dir: `dist/public`.

## 3. Neon Postgres (via Vercel)

1. In the Vercel project → **Storage → Create database → Neon (Postgres)**.
2. Pick a region close to you. Connect it to the project.
3. Vercel auto-injects `DATABASE_URL` as an env var.
4. Locally, grab the same `DATABASE_URL` from Neon's console (use the **pooled** connection string).

## 4. Environment variables (Production + Preview)

- `DATABASE_URL` — set by the Neon integration, or paste manually.
- `SESSION_SECRET` — long random string. `openssl rand -hex 32` works.
- `APP_PASSWORD_HASH` — from step 1.

Then deploy.

## 5. Initialize the database schema

```bash
DATABASE_URL="<prod-url>" npm run db:push
```

This creates: `users`, `task_templates`, `daily_tasks`, `deadlines`, `holidays`, `custom_streaks`, `custom_streak_entries`, `sessions`.

## 6. Local development

```bash
cp .env.example .env
# fill in DATABASE_URL, SESSION_SECRET, APP_PASSWORD_HASH
npm run db:push
npm run dev
```

Visit <http://localhost:5000> and enter your password.

## Troubleshooting

- **App crashes on boot with "X must be set"**: one of `DATABASE_URL`, `SESSION_SECRET`, `APP_PASSWORD_HASH` is missing.
- **Correct password rejected**: make sure you pasted the full `scrypt$salt$hash` value with no surrounding quotes or trailing spaces.
- **Session not persisting**: make sure the `sessions` table exists (`npm run db:push`) and `SESSION_SECRET` is set.
