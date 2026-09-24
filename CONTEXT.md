# os-todo

Personal, single-user fork of DailyDo (hierarchical template-based daily task tracker). A React + Vite frontend communicates with an Express.js API running as a single Vercel serverless function (`api/index.ts`). Single-password auth, Neon Postgres via Drizzle ORM. No Google integration.

**This is a standalone git repository and the root of the project.**

## Connection to Parent
Repository root. Contains the full application: serverless entry point, client, server, shared types, deployment scripts, and config.

## Gatekeep
Uses Gatekeep (`github.com/Stephen-Schuster/gatekeep`) for enforced step-by-step development workflow. Configured in `.gates.yaml`:
- **Steps**: prd → spec → implement → test → done
- **Gates**: PRD review (file exists + NL completeness), spec review (file exists + no TODOs + NL alignment), implementation review (TypeScript compile + tests + lint + NL code review), E2E verification (NL deployed app check)
- **Permissions**: Each step restricts edit/bash to appropriate files/tools
- **Agents**: Applies to all agents (`*`)

## Architecture

- `client/` — React + Vite. Built to `dist/public`.
- `server/` — Express app. `server/index.ts` exports `getApp()` (cold-start memoized) and only starts an HTTP listener when run directly (`tsx server/index.ts`). Checks `import.meta.url === file://${process.argv[1]}` to detect "run directly".
- `api/index.ts` — Vercel serverless function entrypoint. Imports `getApp()` and proxies the request to Express.
- `shared/schema.ts` — Drizzle schema (Postgres).
- `vercel.json` — rewrites `/api/*` → serverless function, everything else → SPA.
- Vite dev middleware is loaded only in dev mode and only when running standalone (not on Vercel).

## Auth

- `server/auth/index.ts` — single-user password login. Sessions in Postgres via `express-session` + `connect-pg-simple` (`sessions` table).
- `APP_PASSWORD_HASH` env var holds `scrypt$<salt hex>$<hash hex>` (see `server/auth/password.ts`). Generate with `npm run hash-password -- "pw"`.
- Endpoints: `POST /api/login` `{password}` → sets `req.session.userId`; `POST /api/logout`; `GET /api/auth/user`.
- There is one DB user (`username = "owner"`), auto-created on first successful login by `ensureOwnerUser()`. All data is still keyed by `userId`, so the multi-user schema is intact if ever needed.
- Protected routes use `requireAuth = [isAuthenticated, resolveAppUser]`. After that, `req.appUser.id` is the integer user ID used for all storage queries.
- Failed logins sleep 1s before responding to slow down guessing.

## Database

- Neon serverless driver (`@neondatabase/serverless`) + `drizzle-orm/neon-serverless` (WebSocket-based Pool, supports transactions). Required for Vercel serverless because `pg` Pool doesn't play well with short-lived functions.
- `npm run db:push` creates/syncs schema.
- Columns are snake_case in the DB and camelCase in TS; Drizzle maps them. Use snake_case in raw SQL.

## Import / Export

- `server/import/importer.ts` — `importUserData(userId, payload, onProgress)` is the canonical bulk import path. Runs inside a single Drizzle transaction so a failure rolls back to the user's previous state.
- `server/import/depth.ts` — pure helpers `groupByDepth` and `chunk`. Pretested.
- Endpoints: `POST /api/import` (one-shot) and `POST /api/import/stream` (SSE). The client uses the streaming endpoint to render a progress bar.
- **Pitfall:** Don't go back to per-row `await storage.createDailyTask(...)` inside the import loop — with ~5000+ rows it blows past Vercel's 60s function timeout.
- **Pitfall:** Depth-sort children by depth, not just by "has parentId or not". Multi-level hierarchies need `groupByDepth`; a one-pass sort drops grandchildren because their parent IDs aren't in the map yet at insert time.
- **Pitfall:** `if (!node.parentId)` is wrong for ID 0. Use `node.parentId == null`.
- Postgres parameter cap is 65535. Daily tasks have ~14 columns; chunk at 1000 rows to keep a generous margin.

## Deadlines & Chores

- `deadlines` table: `name`, `dueDate` (YYYY-MM-DD), `repeatDays` (null = one-off; 30 = same day next month; 365 = same day next year; else N days), `bucket`, `isDone`.
- Managed on `/deadlines` (`client/src/pages/deadlines.tsx`) via `GET/POST/PATCH/DELETE /api/deadlines`.
- `syncDeadlines()` in `server/routes.ts` runs whenever a day's tasks are fetched: creates a `[Deadline] name` daily task (linked by `daily_tasks.deadline_id`) for each non-done deadline due that date, nested under a task whose title matches `bucket`; deletes still-incomplete deadline tasks whose deadline is no longer due that day.
- Complete → recurring: `dueDate = computeNewDate(task.date, repeatDays)`; one-off: `isDone = true`. Put off → `dueDate = task.date + days`. Both store the previous `dueDate` in the task's `deadlineOriginalDate`; undo restores it and clears `isDone`.
- **Pitfall:** Deadlines only appear on the exact due date. If you never open that day, the deadline sits in the past. The Deadlines page lists these under "Overdue".

## Versioning & Deploy

- The version in `package.json` is rendered as `vX.Y.Z` in the bottom-right of every page (`client/src/components/version-badge.tsx`, injected via Vite `define` from `package.json`). The user uses this to confirm what build their browser is showing.
- **Always bump the version on every production deploy.** Use `./scripts/deploy-prod.sh "short description" [patch|minor|major]` from a clean `main` checkout — it bumps, commits, pushes, and triggers a Vercel prod deploy via REST. Don't deploy without bumping.
- **Pick the bump level at your own discretion:**
  - MAJOR (1st) — large feature addition or a change in the user-facing model of the app.
  - MINOR (2nd) — substantive change: a single feature, a meaningful UX shift, a refactor with user-visible impact, or a serious behavior-changing bug fix.
  - PATCH (3rd) — bug fix, minor fix, copy tweak, dep bump, internal cleanup. Default if no level passed.
- The script polls Vercel until READY/ERROR. It refuses to run if the working tree is dirty or the branch isn't `main`.
- Canonical doc-comment for this convention lives in `client/src/components/version-badge.tsx`. Keep it in sync.

## Testing

- `npm test` runs vitest. Config in `vitest.config.ts`. Pattern: `{server,shared,client}/**/*.test.ts`.
- `vitest.config.ts` MUST mirror the `@/` and `@shared/` aliases from `tsconfig.json` or imports break in test mode.
- Tests cover: password hashing + owner user (`server/auth/index.test.ts`), deadline date math + validation (`server/deadlines.test.ts`), import depth/chunk helpers (`server/import/depth.test.ts`), and the queryKey URL builder (`client/src/lib/queryClient.test.ts`).
- Use the `vi.mock` + dynamic `await import` pattern for module-level singletons.
- **Pitfall:** When mocking a class constructor, use a real class, not `vi.fn().mockImplementation(() => ({...}))`. The latter is a function but not a constructor — `new FakeOAuth2()` throws "is not a constructor". Pattern: `class FakeOAuth2 { setCredentials = vi.fn(); refreshAccessToken = vi.fn() }` and return that from the `vi.mock` factory.

## Conventions

### React Query queryKey URL building
- `getQueryFn` in `client/src/lib/queryClient.ts` builds the request URL from `queryKey`. The first element is the path. Any subsequent string starting with `?` or `&` is appended directly (no slash). Other strings are slash-joined.
- **Pitfall:** Don't use `queryKey.join("/")`. It produces `/api/days/summary/?start=...` (slash before `?`). Express 404s on the trailing slash. The original Replit dev stack masked this; Vercel/Express does not.
- **Pitfall:** API returning JSON via curl ≠ UI working. When debugging UI symptoms, always check the actual fetch URL the client sends via browser devtools → Network.

## UI

- Design system follows `docs/UI-STYLE-GUIDE.md` ("OS Wallet" look). Tailwind v4 via `@tailwindcss/vite`; all tokens live in `client/src/index.css` (no `tailwind.config`).
- shadcn primitives in `client/src/components/ui/` are still Radix-based, restyled to match base-nova. App building blocks (PageHeader, Segmented, ThemeToggle, StatusChip, Kpi, EmptyState) are in `components/app-ui.tsx`; the shell (sidebar, mobile header, tab bar) is `components/app-shell.tsx`.
- Theme: `localStorage.theme` = light/dark (absent = system), applied pre-paint by the inline script in `client/index.html`, driven at runtime by `lib/theme.ts`.
- Toasts use `sonner` (`import { toast } from "sonner"`).
- Logo: `client/public/assets/icon.svg` (favicon). `components/logo.tsx` renders the same geometry in `currentColor` from `components/logo-paths.ts`, which is generated from the SVG; regenerate it if the icon changes.

## Local Dev Quirks

- Cold start ~1-2s on first request after idle. Acceptable. Options to reduce: warm with cron, or refactor to per-route serverless functions.
- **Do not add Replit Vite plugins back.** They're removed from `vite.config.ts` and `package.json` and require Replit env vars.

## Contents

- `.env` — Local environment variables (gitignored)
- `.env.example` — Template for required environment variables
- `components.json` — shadcn/ui configuration (Tailwind v4, no config file; path aliases)
- `drizzle.config.ts` — Drizzle Kit config for database migrations and introspection with Neon Postgres
- `package.json` — Project metadata, scripts (dev, build, start, test, check, db:push), and dependencies
- `package-lock.json` — Dependency lockfile
- `README.md` — Project overview with architecture, stack, and Vercel deployment guidance
- `tsconfig.json` — TypeScript config with path aliases (@/, @shared/) for client and server
- `vercel.json` — Vercel deployment config: SPA rewrites and API function routing
- `vite.config.ts` — Vite build config with React plugin, path aliases, and `__APP_VERSION__` injection from package.json
- `vitest.config.ts` — Vitest test runner config with path alias resolution and file patterns

## Subfolders
- `api/` — Vercel serverless function entrypoint that proxies requests to the Express app (see CONTEXT.md for details)
- `client/` — React + Vite frontend: HTML shell, source code, and static assets (see CONTEXT.md for details)
- `docs/` — Project documentation including setup guide for external services (see CONTEXT.md for details)
- `scripts/` — Automation scripts for production deployment and version bumping (see CONTEXT.md for details)
- `server/` — Express.js backend: API routes, password auth, database access, deadlines (see CONTEXT.md for details)
- `shared/` — Drizzle ORM schema, Zod validation, and types shared between client and server (see CONTEXT.md for details)
