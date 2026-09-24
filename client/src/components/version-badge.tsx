/**
 * Tiny build version badge fixed to the bottom-right of the viewport.
 * The version string comes from package.json, injected at build time via Vite's
 * `define` (see `vite.config.ts`).
 *
 * Versioning convention (semver-ish, agent-judgement-based):
 *   MAJOR (1st) — large feature addition, multi-day effort, or a change in
 *                 the user-facing model of the app.
 *   MINOR (2nd) — substantive change: a single feature, a meaningful UX shift,
 *                 a refactor with user-visible impact, or a fix for a serious
 *                 bug that changes behavior.
 *   PATCH (3rd) — bug fix, minor fix, copy tweak, dependency bump, internal
 *                 cleanup, or anything where the user wouldn't notice without
 *                 being told.
 *
 * Pick one at your own discretion every deploy — don't ask the user. Bump
 * every production deploy so the badge always changes; the user relies on the
 * badge to verify which build their tab is showing.
 */
export function VersionBadge() {
  return (
    <div
      className="fixed bottom-1.5 right-2 z-50 pointer-events-none select-none text-[10px] leading-none text-muted-foreground/70 tabular-nums"
      data-testid="version-badge"
      aria-label={`App version ${__APP_VERSION__}`}
    >
      v{__APP_VERSION__}
    </div>
  );
}
