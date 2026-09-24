# os-todo

Personal, single-user fork of [DailyDo](https://github.com/schustuff/DailyDo-Vercel), a hierarchical template-based daily task tracker. Hosted on **Vercel** with **Neon Postgres**, behind a single password.

## Stack
- Frontend: React + Vite + Tailwind + Shadcn UI
- Backend: Express (single Vercel serverless function at `api/index.ts`)
- DB: Neon Postgres via `@neondatabase/serverless` + Drizzle ORM
- Auth: one scrypt-hashed password (`APP_PASSWORD_HASH`) with PG-backed sessions
- Deadlines & chores: stored in Postgres, managed on the Deadlines page

## Local development

```bash
cp .env.example .env
npm install
npm run hash-password -- "your password"   # paste output into APP_PASSWORD_HASH in .env
# also fill in DATABASE_URL and SESSION_SECRET
npm run db:push        # creates tables in DATABASE_URL
npm run dev            # http://localhost:5000
```

## Deploying to Vercel

See [`docs/SETUP.md`](docs/SETUP.md).
