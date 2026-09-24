# DailyDo-Vercel

Vercel-adapted version of the hierarchical template-based daily task tracker. A React + Vite frontend communicates with an Express.js API running as a single Vercel serverless function (`api/index.ts`). Uses Google OAuth for authentication, Neon Postgres via Drizzle ORM, and integrates with Google Sheets for deadline tracking.

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

- `server/auth/index.ts` — Passport + `passport-google-oauth20`. Sessions in Postgres via `connect-pg-simple` (`sessions` table).
- Login: `GET /api/login` → Google. Callback: `GET /api/callback`. Logout: `GET /api/logout`. Current user: `GET /api/auth/user`.
- Scopes requested on every login (with `prompt=consent`, `access_type=offline`): `openid email profile https://www.googleapis.com/auth/spreadsheets`. The Sheets scope means we get a refresh token we can reuse for the user's Google Sheets.
- `users.google_id` stores Google's `profile.id` (the OIDC `sub`). `users.refresh_token` stores the long-lived refresh token for Sheets.
- `req.appUser` is populated by the `resolveAppUser` middleware in `server/routes.ts` from the session's `googleId`.
- Protected routes use `requireAuth = [isAuthenticated, resolveAppUser]`. After that, `req.appUser.id` is the integer user ID used for all storage queries.
- **Pitfall:** `req.user` from Passport contains a `SessionUser` (lightweight session struct), not the DB `User`. Always go through `resolveAppUser` to get `req.appUser`.
- **Pitfall:** Google may not return a refresh token on subsequent logins — `prompt: "consent"` forces the consent screen each time. Do not remove without a plan.

### DEV_BYPASS_AUTH (test mode)

- Setting `DEV_BYPASS_AUTH=true` short-circuits the entire auth flow: every request is auto-authenticated as a fixed bypass user (`googleId: dev-bypass-test-user`).
- The bypass user is auto-created on first request and pinned to a public test sheet. Settings.spreadsheetId is forced to that sheet ID.
- The bypass user has no real OAuth grant, so it borrows a refresh token from any other (real) user in the DB. If no real user has ever logged in, Sheets calls will fail with "Google account is not connected".
- `GoogleStrategy` registration is guarded by presence of `GOOGLE_CLIENT_ID/SECRET` so the app boots in bypass mode without OAuth env vars. `/api/login` and `/api/callback` no-op-redirect to `/`.
- The bypass user load is memoized at module scope (`bypassUserPromise`) — failure clears the cache so the next request retries.
- **Pitfall:** `vi.mock('../storage.js')` must precede `await import('./index.js')` in tests because the auth module captures the storage reference at import time.

## Database

- Neon serverless driver (`@neondatabase/serverless`) + `drizzle-orm/neon-serverless` (WebSocket-based Pool, supports transactions). Required for Vercel serverless because `pg` Pool doesn't play well with short-lived functions.
- `npm run db:push` creates/syncs schema.
- **Pitfall:** The `users.google_id` column is named `google_id` in the DB but `googleId` in TS. Drizzle maps these. If you write raw SQL, use the snake_case form.

## Import / Export

- `server/import/importer.ts` — `importUserData(userId, payload, onProgress)` is the canonical bulk import path. Runs inside a single Drizzle transaction so a failure rolls back to the user's previous state.
- `server/import/depth.ts` — pure helpers `groupByDepth` and `chunk`. Pretested.
- Endpoints: `POST /api/import` (one-shot) and `POST /api/import/stream` (SSE). The client uses the streaming endpoint to render a progress bar.
- **Pitfall:** Don't go back to per-row `await storage.createDailyTask(...)` inside the import loop — with ~5000+ rows it blows past Vercel's 60s function timeout.
- **Pitfall:** Depth-sort children by depth, not just by "has parentId or not". Multi-level hierarchies need `groupByDepth`; a one-pass sort drops grandchildren because their parent IDs aren't in the map yet at insert time.
- **Pitfall:** `if (!node.parentId)` is wrong for ID 0. Use `node.parentId == null`.
- Postgres parameter cap is 65535. Daily tasks have ~14 columns; chunk at 1000 rows to keep a generous margin.

## Google Sheets Integration

- `server/googleSheets.ts` — every public function takes `userId` first. Internally it loads the user's `refreshToken`, exchanges it for an access token via `google.auth.OAuth2.refreshAccessToken()`, and caches the access token in-memory (per cold-start instance).
- If Google rotates the refresh token, we persist the new value.

### REAUTH_REQUIRED Self-Healing

- When Google rejects the stored refresh token (revoked, replaced, expired, password changed, hit per-client refresh-token cap), `getAccessTokenForUser` catches it, nulls `users.refresh_token`, clears the in-memory cache, and throws `ReauthRequiredError`.
- Sheets-touching routes (`complete-deadline`, `putoff-deadline`, `undo-deadline`) call `sendSheetsError(res, err, fallback)` which maps that error to a **401** with `{code: "REAUTH_REQUIRED"}`.
- The client (`queryClient.ts`) sees that code and bounces the user to `/api/login`, which reissues a fresh grant via `prompt=consent`.
- **Pitfall:** Don't bubble the raw Google error string to the user. Always go through `sendSheetsError` for any Sheets-touching route.
- **Pitfall:** Don't redirect to `/api/login` from inside `syncDeadlines` or other implicit Sheets calls — bouncing the user to OAuth on page render would be hostile. Implicit Sheets calls swallow errors with `console.error`. Only explicit user-initiated Sheets actions (deadline mutation routes) should surface `REAUTH_REQUIRED`.
- **Pitfall:** A 403 from the Sheets API is ambiguous. It can mean (a) "the access token doesn't carry the `spreadsheets` scope" (fixable by re-consent) or (b) "this Google account doesn't have edit access on this spreadsheet" (fixable only by sharing the sheet). Distinguish via `isInsufficientScopeError`. Scope-insufficient → clear `refresh_token` + `ReauthRequiredError`. Other 403 → keep the existing "share edit access" message. Centralized in `handleSheetsApiError(userId, err)`.
- **Pitfall:** In-memory `tokenCache` survives Google grant revocation. When a user revokes their grant and re-consents, the warm function instance still has the previous access token cached for up to 50 minutes. `auth/index.ts` calls `clearTokenCacheForUser(userId)` on every successful login. Also: `handleSheetsApiError` detects 401 invalid-credentials and treats it as `REAUTH_REQUIRED` so the user self-heals via redirect.

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
- Tests cover: bypass auth helpers (`server/auth/index.test.ts`), import depth/chunk helpers (`server/import/depth.test.ts`), queryKey URL builder + REAUTH_REQUIRED redirect (`client/src/lib/queryClient.test.ts`), and the Sheets `invalid_grant` self-healing path (`server/googleSheets.test.ts`).
- Use the `vi.mock` + dynamic `await import` pattern for module-level singletons.
- **Pitfall:** When mocking a class constructor (e.g. `google.auth.OAuth2`), use a real class, not `vi.fn().mockImplementation(() => ({...}))`. The latter is a function but not a constructor — `new FakeOAuth2()` throws "is not a constructor". Pattern: `class FakeOAuth2 { setCredentials = vi.fn(); refreshAccessToken = vi.fn() }` and return that from the `vi.mock` factory.

## Conventions

### React Query queryKey URL building
- `getQueryFn` in `client/src/lib/queryClient.ts` builds the request URL from `queryKey`. The first element is the path. Any subsequent string starting with `?` or `&` is appended directly (no slash). Other strings are slash-joined.
- **Pitfall:** Don't use `queryKey.join("/")`. It produces `/api/days/summary/?start=...` (slash before `?`). Express 404s on the trailing slash. The original Replit dev stack masked this; Vercel/Express does not.
- **Pitfall:** API returning JSON via curl ≠ UI working. When debugging UI symptoms, always check the actual fetch URL the client sends via browser devtools → Network.

## Local Dev Quirks

- Cold start ~1-2s on first request after idle. Acceptable. Options to reduce: warm with cron, or refactor to per-route serverless functions.
- **Do not add Replit Vite plugins back.** They're removed from `vite.config.ts` and `package.json` and require Replit env vars.

## Contents

- `.env` — Local environment variables (gitignored)
- `.env.example` — Template for required environment variables
- `components.json` — shadcn/ui configuration (new-york style, path aliases)
- `drizzle.config.ts` — Drizzle Kit config for database migrations and introspection with Neon Postgres
- `package.json` — Project metadata, scripts (dev, build, start, test, check, db:push), and dependencies
- `package-lock.json` — Dependency lockfile
- `postcss.config.js` — PostCSS plugin config for Tailwind CSS and autoprefixer
- `README.md` — Project overview with architecture, stack, and Vercel deployment guidance
- `tailwind.config.ts` — Tailwind CSS theme with shadcn/ui design tokens and content paths
- `tsconfig.json` — TypeScript config with path aliases (@/, @shared/) for client and server
- `vercel.json` — Vercel deployment config: SPA rewrites and API function routing
- `vite.config.ts` — Vite build config with React plugin, path aliases, and `__APP_VERSION__` injection from package.json
- `vitest.config.ts` — Vitest test runner config with path alias resolution and file patterns

## Subfolders
- `api/` — Vercel serverless function entrypoint that proxies requests to the Express app (see CONTEXT.md for details)
- `client/` — React + Vite frontend: HTML shell, source code, and static assets (see CONTEXT.md for details)
- `docs/` — Project documentation including setup guide for external services (see CONTEXT.md for details)
- `scripts/` — Automation scripts for production deployment and version bumping (see CONTEXT.md for details)
- `server/` — Express.js backend: API routes, Google OAuth, database access, Sheets integration (see CONTEXT.md for details)
- `shared/` — Drizzle ORM schema, Zod validation, and types shared between client and server (see CONTEXT.md for details)
