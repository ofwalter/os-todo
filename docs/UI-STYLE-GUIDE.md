# UI Style Guide — "OS Wallet" look

A complete, portable spec of this app's UI so another project can reproduce it
almost exactly. It is written to be handed to a developer **or an AI coding
agent**: follow it literally, copy the code blocks verbatim, and only change
what the "Customize" notes allow.

> **Logo:** not included. Wherever this guide says `<Logo />` or `<LogoMark />`,
> drop in your own component (a `currentColor` SVG sized `size-8` works best, so
> it follows light/dark automatically).

---

## 0. Design in one paragraph

Calm, dense, "fintech-neutral". A near-white canvas with a barely-there **green
tint (hue 160)** in every gray, white cards outlined by a **1px hairline ring**
plus a whisper of shadow, generous **16px (rounded-2xl) card corners**, and a
single **brand green** (`oklch(0.47 0.11 155)`) used sparingly for active
states, badges, and focus. Typography is **Inter** for UI and **Inter Tight** for
headings and numbers, with tabular figures everywhere money appears. Dark mode is
a true first-class theme (deep green-black, not gray), switched by a `.dark`
class with a Light / System / Dark toggle. Charts use a validated 5-color
palette. Motion is minimal: color transitions, a 1px press-down on buttons,
pulse skeletons.

---

## 1. Stack (match these to get identical results)

| Piece | Version / choice |
|---|---|
| Framework | Next.js (App Router) + React 19 + TypeScript |
| CSS | **Tailwind CSS v4** (CSS-first config, `@theme inline`, no `tailwind.config`) |
| Components | **shadcn/ui**, style **`base-nova`**, base color `neutral`, CSS variables on, built on **`@base-ui/react`** (not Radix) |
| Icons | `lucide-react` (default stroke 2, `size-4` in buttons) |
| Charts | `recharts` v3 via shadcn's `chart.tsx` |
| Toasts | `sonner` |
| Animation utils | `tw-animate-css` |
| Class helpers | `clsx` + `tailwind-merge` (`cn()`), `class-variance-authority` |
| Fonts | `next/font/google`: Inter, Inter Tight, Geist Mono |

### Setup

```bash
npm i @base-ui/react lucide-react recharts sonner clsx tailwind-merge class-variance-authority tw-animate-css shadcn
npm i -D tailwindcss @tailwindcss/postcss
```

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "menuColor": "default",
  "menuAccent": "subtle"
}
```

Then add the primitives used by this app:

```bash
npx shadcn@latest add avatar badge button card chart checkbox dialog dropdown-menu input label popover progress scroll-area select separator sheet skeleton sonner switch table tabs toggle toggle-group tooltip
```

After adding, apply the **two overrides** in §6 (Card and Sonner). Everything
else is stock `base-nova`, and it picks up the look from the tokens below.

`lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 2. `app/globals.css` — copy verbatim

This file **is** the design system. Replace the generated one entirely.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  --font-heading: var(--font-inter-tight), var(--font-inter), ui-sans-serif, sans-serif;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-positive: var(--positive);
  --color-negative: var(--negative);
  --color-warning: var(--warning);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(0.984 0.003 160);
  --foreground: oklch(0.18 0.015 160);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0.015 160);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.18 0.015 160);
  --primary: oklch(0.2 0.02 160);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.96 0.006 160);
  --secondary-foreground: oklch(0.22 0.02 160);
  --muted: oklch(0.962 0.005 160);
  --muted-foreground: oklch(0.52 0.018 160);
  --accent: oklch(0.955 0.012 160);
  --accent-foreground: oklch(0.22 0.02 160);
  --destructive: oklch(0.577 0.215 22);
  --border: oklch(0.915 0.007 160);
  --input: oklch(0.9 0.008 160);
  --ring: oklch(0.52 0.11 155);
  --brand: oklch(0.47 0.11 155);
  --brand-foreground: oklch(0.99 0 0);
  --positive: oklch(0.56 0.14 160);
  --negative: oklch(0.58 0.2 20);
  --warning: oklch(0.72 0.16 70);
  --radius: 0.75rem;
  /* Chart series, validated against the card surface. */
  --chart-1: #5b4ff0;
  --chart-2: #eb6834;
  --chart-3: #1baf7a;
  --chart-4: #eda100;
  --chart-5: #e87ba4;
  --viz-grid: oklch(0.93 0.005 160);
  --viz-negative: #e34948;
  --sidebar: oklch(0.99 0.002 160);
  --sidebar-foreground: oklch(0.2 0.015 160);
  --sidebar-primary: oklch(0.47 0.11 155);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.955 0.008 160);
  --sidebar-accent-foreground: oklch(0.18 0.015 160);
  --sidebar-border: oklch(0.925 0.006 160);
  --sidebar-ring: oklch(0.52 0.11 155);
  --shadow-card: 0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.03);
}

.dark {
  --background: oklch(0.145 0.008 160);
  --foreground: oklch(0.97 0.004 160);
  --card: oklch(0.185 0.01 160);
  --card-foreground: oklch(0.97 0.004 160);
  --popover: oklch(0.2 0.012 160);
  --popover-foreground: oklch(0.97 0.004 160);
  --primary: oklch(0.96 0.004 160);
  --primary-foreground: oklch(0.18 0.015 160);
  --secondary: oklch(0.24 0.012 160);
  --secondary-foreground: oklch(0.97 0.004 160);
  --muted: oklch(0.235 0.01 160);
  --muted-foreground: oklch(0.7 0.015 160);
  --accent: oklch(0.26 0.02 160);
  --accent-foreground: oklch(0.97 0.004 160);
  --destructive: oklch(0.68 0.19 22);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.64 0.12 155);
  --brand: oklch(0.55 0.12 155);
  --brand-foreground: oklch(0.99 0 0);
  --positive: oklch(0.72 0.15 160);
  --negative: oklch(0.7 0.17 20);
  --warning: oklch(0.8 0.15 75);
  --chart-1: #8a7dff;
  --chart-2: #d95926;
  --chart-3: #199e70;
  --chart-4: #c98500;
  --chart-5: #d55181;
  --viz-grid: oklch(1 0 0 / 7%);
  --viz-negative: #e66767;
  --sidebar: oklch(0.165 0.009 160);
  --sidebar-foreground: oklch(0.97 0.004 160);
  --sidebar-primary: oklch(0.55 0.12 155);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.24 0.012 160);
  --sidebar-accent-foreground: oklch(0.97 0.004 160);
  --sidebar-border: oklch(1 0 0 / 7%);
  --sidebar-ring: oklch(0.64 0.12 155);
  --shadow-card: 0 1px 2px 0 rgb(0 0 0 / 0.3);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
    font-feature-settings: "cv11", "ss01", "ss03";
    -webkit-tap-highlight-color: transparent;
  }
  body {
    @apply bg-background text-foreground;
    text-rendering: optimizeLegibility;
  }
  h1,
  h2,
  h3 {
    @apply font-heading tracking-tight;
  }
  input[type="date"]::-webkit-calendar-picker-indicator {
    opacity: 0.55;
    cursor: pointer;
  }
  .dark input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(1);
  }
}

@layer components {
  /* Card surface used across the app: hairline ring + a whisper of shadow. */
  .surface {
    @apply rounded-2xl bg-card text-card-foreground ring-1 ring-border;
    box-shadow: var(--shadow-card);
  }
  .num {
    @apply font-heading tabular-nums tracking-tight;
  }
  .eyebrow {
    @apply text-[0.6875rem] font-medium tracking-[0.06em] text-muted-foreground uppercase;
  }
}

@utility scrollbar-none {
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

@utility pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
```

**Customize:** to re-skin for a different brand, change only the hue. All
neutrals use hue **160** and the brand/ring use **155**. Swap both numbers
everywhere (e.g. 250 for a blue-tinted app) and keep lightness and chroma as-is.
Leave the chart colors alone, since they were contrast-validated as a set.

---

## 3. Design tokens explained

### Color roles

| Token (Tailwind class) | Use it for | Never use it for |
|---|---|---|
| `bg-background` | Page canvas | Cards |
| `bg-card` / `.surface` | Every content container | — |
| `bg-popover` | Menus, selects, tooltips, chart tooltips | — |
| `bg-primary` / `text-primary-foreground` | The one dark (light in dark mode) CTA per view: Sign in, Save | Decorative fills |
| `bg-muted` | Segmented-control track, skeletons, neutral chips, stat strips (`bg-muted/50`), table headers (`bg-muted/40`), row hover (`hover:bg-muted/40`) | Text |
| `text-muted-foreground` | Secondary text, labels, captions, inactive icons, axis ticks | Body copy |
| `brand` | Active nav icon, count badges, "Manual" badge, selected toggle state (`bg-brand/10 text-brand border-brand/40`), empty-state icon tile, login glow | Large fills, body text |
| `positive` | Inflows (`+$120.00`), good deltas, success dots | — |
| `negative` | Bad deltas, negative net, error dots | Spending amounts (spending is plain foreground) |
| `warning` | Needs-review chips (`bg-warning/15 text-amber-700 dark:text-warning`), partial-status dots | — |
| `destructive` | Delete / remove buttons (tinted, not solid: `bg-destructive/10 text-destructive`) | — |
| `border` / `ring-border` | All hairlines | — |
| `chart-1…5`, `--viz-grid`, `--viz-negative` | Charts only (see §9) | UI chrome |

**Tinted-fill recipe:** colored backgrounds are always the token at low
opacity with full-strength text: `bg-brand/10 text-brand`,
`bg-positive/12 text-positive`, `bg-negative/12 text-negative`,
`bg-warning/15`. For arbitrary hex colors (categories), use
`color-mix(in oklab, <hex> 14%, transparent)` as the background and the hex as
the foreground.

### Radius scale (`--radius: 0.75rem`)

| Class | Size | Used on |
|---|---|---|
| `rounded-md` | ~9.6px | Segmented/toggle inner buttons, small chips (`rounded-md` badges) |
| `rounded-lg` | 12px | Buttons, inputs, selects, nav items, menus, segmented track |
| `rounded-xl` | ~16.8px | Inner panels: stat strips, list groups inside cards, category icon tile |
| `rounded-2xl` | ~21.6px | **Cards / surfaces**, dialogs, skeleton blocks, sheet top corners |
| `rounded-full` | — | Dots, count badges, delta pills, progress bars |

### Elevation

Only three levels:
1. **Flat surface:** `.surface` (ring-1 + `--shadow-card`). Used for 95% of containers.
2. **Floating:** popovers, menus, selects use `shadow-md ring-1 ring-foreground/10`, and chart tooltips use `shadow-xl`.
3. **Hero card:** the login card only, `bg-card/80 shadow-xl ring-1 ring-border backdrop-blur-xl`.

Sticky chrome (mobile header, tab bar, day headers) uses **frosted glass**:
`bg-background/85 backdrop-blur-xl` (or `bg-card/95 backdrop-blur`).

---

## 4. Typography

Fonts (root layout):

```tsx
import { Geist_Mono, Inter, Inter_Tight } from "next/font/google";
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// <html className={`${inter.variable} ${interTight.variable} ${geistMono.variable} h-full antialiased`}>
```

Inter stylistic sets `cv11 ss01 ss03` are enabled globally (single-storey `a`,
open digits, and so on). This is a big part of the look, so keep it.

### Scale

| Role | Classes |
|---|---|
| Page title (h1) | `text-2xl font-semibold sm:text-[1.75rem]` (font-heading + tracking-tight come from base) |
| Eyebrow above title / section labels | `.eyebrow` (11px, medium, 0.06em tracking, uppercase, muted) |
| Card title (h2) | `font-heading text-[0.9375rem] font-semibold tracking-tight` (15px) |
| Card subtitle | `text-xs text-muted-foreground` |
| Body / list primary | `text-sm font-medium` |
| List secondary | `text-xs text-muted-foreground` |
| Page description | `text-sm text-muted-foreground` |
| KPI label | `text-xs font-medium text-muted-foreground` |
| Big number (KPI) | `num text-[1.75rem] leading-none font-semibold sm:text-3xl` |
| Medium number | `num text-base font-semibold` |
| Table column headings | `text-[0.6875rem] font-medium tracking-wide uppercase text-muted-foreground` |
| Micro badges | `text-[0.625rem] font-semibold tracking-wide uppercase` (10px) |
| Account masks / codes | `font-mono` (e.g. `••1234`) |

### Numbers

- Every money value uses `tabular-nums`, and big ones use `.num`.
- **Big money:** de-emphasize cents. Render `$1,234` at full size and `.56` at
  `text-[0.6em] text-muted-foreground` (see `Money` in §7).
- Signs: inflow is `+$120.00` in `text-positive`, and outflow is `$45.10` in the
  default foreground (no minus sign). For a negative net, use a real minus `−`
  (U+2212), not a hyphen.
- Compact axis labels: `$950`, `$1.2K`, `$34K`.
- Empty numeric value: `—` (em dash).

---

## 5. Theme switching (no flash)

Inline this script in `<head>` (in the root layout:
`<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />`, and add
`suppressHydrationWarning` on `<html>`):

```ts
// lib/theme-script.ts: kept free of React imports so a server layout can inline it.
export const THEME_KEY = "theme";
export const THEME_SCRIPT = `(() => {
  const m = matchMedia("(prefers-color-scheme: dark)");
  const pref = () => { try { return localStorage.getItem("${THEME_KEY}") || "system"; } catch { return "system"; } };
  const apply = () => {
    const p = pref();
    document.documentElement.classList.toggle("dark", p === "dark" || (p === "system" && m.matches));
  };
  apply();
  m.addEventListener("change", apply);
  window.__applyTheme = apply;
})();`;
```

```ts
// lib/theme.ts
"use client";
import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePreference = "light" | "dark" | "system";
const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {}
  (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
  listeners.forEach((l) => l());
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => "system",
  );
}

/** The theme actually on screen, following the html.dark class. */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    },
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  );
}
```

Viewport meta (Next `viewport` export):

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f14" },
  ],
};
```

Root body: `<body className="flex min-h-full flex-col">`, wrapped in
`<TooltipProvider delay={300}>` with `<Toaster position="top-center" />`.

---

## 6. shadcn primitive overrides

Stock `base-nova` is used for everything except these two.

**Card** (`components/ui/card.tsx`): 2xl radius, hairline ring, the custom
shadow, 20px spacing (12px for `size="sm"`), and a 15px heading-font title.

```tsx
// Card root className:
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl bg-card py-(--card-spacing) text-sm text-card-foreground shadow-(--shadow-card) ring-1 ring-border [--card-spacing:--spacing(5)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl"
// CardTitle className:
"font-heading text-[0.9375rem] leading-snug font-semibold tracking-tight group-data-[size=sm]/card:text-sm"
```

Typical card usage on dashboards: `<Card className="px-5 sm:px-6 sm:py-6">`.

**Sonner** (`components/ui/sonner.tsx`): follow the app theme via
`useResolvedTheme()` instead of `next-themes`:

```tsx
const theme = useResolvedTheme();
<Sonner
  theme={theme}
  className="toaster group"
  icons={{ success: <CircleCheckIcon className="size-4" />, info: <InfoIcon className="size-4" />,
           warning: <TriangleAlertIcon className="size-4" />, error: <OctagonXIcon className="size-4" />,
           loading: <Loader2Icon className="size-4 animate-spin" /> }}
  style={{ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)",
           "--normal-border": "var(--border)", "--border-radius": "var(--radius)" } as React.CSSProperties}
  toastOptions={{ classNames: { toast: "cn-toast" } }}
/>
```

### Button reference (stock base-nova, for orientation)

- Sizes are compact: `default` h-8, `sm` h-7 (text 0.8rem), `lg` h-9, `icon` size-8, `icon-sm` size-7.
- Press feedback: `active:translate-y-px`. Focus: `ring-3 ring-ring/50`.
- Variants: `default` (dark solid), `outline` (card-colored with border, **the most-used variant**), `ghost`, `secondary`, `destructive` (tinted), `link`.
- Filter-bar controls use `h-9` to match inputs: `<Button variant="outline" className="h-9">`.
- Links styled as buttons: `className={buttonVariants({ variant: "outline", size: "sm" })}`.

Inputs are h-8 by default. In filter bars, use `h-9 bg-card dark:bg-card`.

---

## 7. App-specific components (copy these)

### Page header + empty state

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, eyebrow, actions, className }: {
  title: React.ReactNode; description?: React.ReactNode; eyebrow?: React.ReactNode;
  actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span className="relative inline-flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/15">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-heading font-semibold tracking-tight">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
```

Inline empty state inside a chart area (no icon):
`flex h-60 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center`
containing a `text-sm font-medium` title and a `text-xs text-muted-foreground` hint.

### Segmented control (the signature "pill" switch)

Used for chart ranges, views, and the theme toggle. It's a muted track with a
raised white thumb.

```tsx
"use client";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T; label: React.ReactNode; short?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>; title?: string;
};

export function Segmented<T extends string>({ value, onChange, options, label, size = "sm", className }: {
  value: T; onChange: (value: T) => void; options: SegmentOption<T>[]; label: string;
  size?: "xs" | "sm"; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 scrollbar-none", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={selected} title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-6 px-2 text-[0.6875rem]",
              selected && "bg-background text-foreground shadow-sm dark:bg-input/40",
            )}>
            {Icon && <Icon className="size-3.5" />}
            {o.short ? (<><span className="sm:hidden">{o.short}</span><span className="hidden sm:inline">{o.label}</span></>) : o.label}
          </button>
        );
      })}
    </div>
  );
}
```

### Theme toggle (icon-only segmented)

```tsx
"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const pref = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={pref === value} aria-label={label} title={label}
          onClick={() => setThemePreference(value)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:text-foreground",
            pref === value && "bg-background text-foreground shadow-sm dark:bg-input/40",
          )}>
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
```

### Icon tile ("avatar" for list rows)

A soft tinted square with a lucide icon in the item's color. It's used for categories
and could be used for any typed entity.

```tsx
export function IconTile({ icon: Icon, color = "#94a3b8", size = "md", className }: {
  icon: LucideIcon; color?: string; size?: "sm" | "md" | "lg"; className?: string;
}) {
  return (
    <span aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-[1.05rem]",
        size === "lg" && "size-11 [&_svg]:size-5",
        className)}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}>
      <Icon strokeWidth={2} />
    </span>
  );
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />;
}
```

Category palette (Tailwind-600-ish hexes, works on both themes):

| Name | Hex | Lucide icon |
|---|---|---|
| Groceries | `#16a34a` | ShoppingCart |
| Dining | `#ea580c` | UtensilsCrossed |
| Coffee | `#92400e` | Coffee |
| Gas | `#ca8a04` | Fuel |
| Transport | `#0891b2` | Car |
| Rent/Housing | `#7c3aed` | House |
| Utilities | `#2563eb` | Zap |
| Subscriptions | `#db2777` | Repeat |
| Shopping | `#e11d48` | ShoppingBag |
| Travel | `#0d9488` | Plane |
| Health/Fitness | `#65a30d` | HeartPulse |
| Entertainment | `#9333ea` | Clapperboard |
| Personal Care | `#c026d3` | Sparkles |
| Gifts | `#dc2626` | Gift |
| Fees | `#57534e` | Receipt |
| Other | `#94a3b8` | CircleDashed |
| Income | `#059669` | Banknote |
| Transfers | `#64748b` | ArrowLeftRight |
| (none) | `#94a3b8` | CircleHelp |

### Money, amount, delta pill, chips

```tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatMoney = (n: number) => usd.format(n);
export function splitMoney(n: number): [string, string] {
  const s = usd.format(n); const i = s.lastIndexOf(".");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}

/** Positive = outflow (plain), negative = inflow (green with +). */
export function Amount({ amount, className }: { amount: number; className?: string }) {
  const inflow = amount < 0;
  return (
    <span className={cn("font-medium tabular-nums", inflow && "text-positive", className)}>
      {inflow ? `+${formatMoney(-amount)}` : formatMoney(amount)}
    </span>
  );
}

/** Large money figure with de-emphasized cents. */
export function Money({ value, className, centsClassName }: { value: number; className?: string; centsClassName?: string }) {
  const [whole, cents] = splitMoney(value);
  return (
    <span className={cn("num", className)}>
      {whole}<span className={cn("text-[0.6em] text-muted-foreground", centsClassName)}>{cents}</span>
    </span>
  );
}

/** % change vs previous. goodWhenDown flips colors (e.g. spending). */
export function DeltaPill({ current, previous, goodWhenDown = false, className }: {
  current: number; previous: number; goodWhenDown?: boolean; className?: string;
}) {
  if (previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  const up = change >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums",
      Math.abs(change) < 0.005 ? "bg-muted text-muted-foreground" : good ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative",
      className)}>
      <Icon className="size-3" strokeWidth={2.5} />
      {`${(Math.abs(change) * 100).toFixed(0)}%`}
    </span>
  );
}

/** Tiny uppercase status label next to a row title. */
export function StatusChip({ children, tone = "neutral", className }: {
  children: React.ReactNode; tone?: "neutral" | "warning" | "brand" | "positive"; className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex h-[1.125rem] items-center rounded-md px-1.5 text-[0.625rem] font-semibold tracking-wide uppercase",
      tone === "neutral" && "bg-muted text-muted-foreground",
      tone === "warning" && "bg-warning/15 text-amber-700 dark:text-warning",
      tone === "brand" && "bg-brand/10 text-brand",
      tone === "positive" && "bg-chart-3/12 text-positive",
      className)}>
      {children}
    </span>
  );
}
```

**Count badge** (nav counts): `inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-semibold text-brand-foreground tabular-nums`, capped at `99+`.

**Status dot + line** (e.g. "Synced 5m ago"): `inline-flex items-center gap-2 text-xs text-muted-foreground` with a leading `size-1.5 rounded-full` dot. The dot is `bg-positive` for OK, `bg-warning` for partial, `bg-negative` for error, `bg-brand animate-pulse` while running, and `bg-muted-foreground/40` for never.

### KPI tile

```tsx
function Kpi({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("surface flex flex-col gap-2.5 p-4 sm:p-5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

// Usage
<div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
  <Kpi label="Spent in Sep" className="col-span-2 sm:col-span-1">
    <div className="flex flex-wrap items-center gap-2">
      <Money value={1234.56} className="text-[1.75rem] leading-none font-semibold sm:text-3xl" />
      <DeltaPill current={1234} previous={1100} goodWhenDown />
    </div>
    <p className="text-xs text-muted-foreground">vs $1,100 by this day last month</p>
  </Kpi>
</div>
```

Small stat (inside a page, e.g. above a table):
`surface px-3 py-2.5 sm:px-4` with a `text-[0.6875rem] font-medium text-muted-foreground`
label and a `num mt-0.5 truncate text-sm font-semibold sm:text-base` value.

In-card stat strip: `grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-xs`,
each cell a muted label plus `num mt-0.5 text-base font-semibold`.

### Card section header (inside a Card)

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div className="space-y-1">
    <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">Cash flow</h2>
    <p className="text-xs text-muted-foreground">Income minus spending, transfers excluded</p>
  </div>
  <div className="flex items-center gap-2">{/* Segmented controls */}</div>
</div>
```

Small "Manage →" link in a card header:
`inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground` + `<ArrowRight className="size-3" />`.

### Lists

**Grouped list inside a card:** `ul.divide-y.rounded-xl.border` with rows
`flex items-center justify-between gap-3 px-3 py-2.5`, preceded by an `.eyebrow`
group label (with a `size-3.5` icon) and a right-aligned `text-xs font-semibold tabular-nums` total.

**Full-width data list (the transactions table pattern):** a single `.surface overflow-clip`
containing:

1. Desktop-only column headings:
   `hidden md:grid grid-cols-[minmax(0,1fr)_11rem_10rem_7.5rem_2.25rem] items-center gap-4 border-b bg-muted/40 px-5 py-2.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase`
2. **Sticky day headers:**
   `sticky top-14 lg:top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-2 backdrop-blur md:px-5`,
   with the title (`font-sans text-xs font-semibold text-foreground`: "Today", "Yesterday", "Mon, Sep 21")
   and a right-aligned daily net (`text-xs text-muted-foreground tabular-nums`).
3. Rows: `ul.divide-y > li` with
   `grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[...same as headings...] md:gap-4 md:px-5`.
   Each row has an icon tile, a truncating title (`text-sm font-medium`) with inline `StatusChip`s, and a
   `text-xs text-muted-foreground` subtitle. The amount is right-aligned. Muted rows use `opacity-55`.
   On mobile the secondary controls wrap to a second line with `col-span-3 pl-12` (aligned under the title).

**Sortable column heading** (the arrow next to a header):

```tsx
function SortHeader({ href, label, active, dir, className }: {
  href: string; label: string; active: boolean; dir: "asc" | "desc"; className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link href={href} scroll={false} aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn("group inline-flex w-fit items-center gap-1 uppercase transition-colors hover:text-foreground",
        active && "text-foreground", className)}>
      {label}
      <Icon className={cn("size-3", !active && "opacity-40 group-hover:opacity-100")} />
    </Link>
  );
}
```

**Pagination:** a left caption `1–50 of 1,234` (`text-sm text-muted-foreground tabular-nums`,
with an en dash) and on the right `Page 1 of 25` (`text-xs`, hidden on phones) plus two
`outline` `icon` buttons with ChevronLeft/ChevronRight. Disabled ones get
`pointer-events-none opacity-40`.

### Filter bar

`flex flex-wrap items-center gap-2`:
- Search: a `relative min-w-0 flex-1 md:max-w-xs` wrapper holding a `Search` icon at
  `absolute left-3 size-4 text-muted-foreground` and an input `h-9 bg-card pl-9 dark:bg-card`.
  It has a round clear button (`size-5 rounded-full hover:bg-muted`) on the right and is debounced at 350ms.
- Desktop: inline `Select`s with `h-9 w-40…w-44` triggers, plus a toggle button. Its active state is
  `border-brand/40 bg-brand/10 text-brand`.
- Mobile: a `Filters` outline button (with a brand count badge) that opens a **bottom Sheet**
  (`side="bottom" className="pb-safe rounded-t-2xl"`), where each control sits under an
  `text-xs font-medium text-muted-foreground` label.
- A ghost "Clear" button (`X` icon, label hidden under `sm`) appears when anything is active.
- While a transition is pending, dim the bar with `transition-opacity opacity-70`.

---

## 8. Layout shell

```
Desktop (lg+):  [ fixed sidebar w-64 ] [ main, max-w-6xl, centered ]
Mobile:         [ sticky frosted header h-14 ]
                [ main ]
                [ fixed frosted bottom tab bar h-16 (5 tabs) ]
```

```tsx
<div className="flex min-h-dvh flex-1">
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar px-4 py-5 lg:flex">
    <Link href="/" className="mb-8 px-2"><Logo /></Link>
    <SidebarNav />
    <div className="mt-auto">{/* sidebar footer */}</div>
  </aside>

  <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
    <MobileHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14">
      {children}
    </main>
  </div>

  <MobileTabBar />
</div>
```

**Sidebar nav:**
- Sections are headed by `.eyebrow mb-1.5 px-3` ("Menu", then "Manage" with `mt-5`).
- Items are `group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground`, and active adds `bg-sidebar-accent text-foreground`.
- Icons are `size-[1.05rem]`. Active is `text-brand` with `strokeWidth={2.25}`, inactive is muted (foreground on group hover) with stroke 2.
- Count badges are right-aligned.
- Active match: `href === "/" ? pathname === "/" : pathname.startsWith(href)`. Set `aria-current="page"`.

**Sidebar footer:** a `rounded-xl border bg-card px-3 py-2` status box (status line + an icon
action button), and below it a row with `ThemeToggle` on the left and a ghost `sm` "Log out" button with a `LogOut` icon on the right.

**Mobile header:** `sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl lg:hidden`, inner
`flex h-14 items-center gap-2 px-4`, with the logo mark (`size-7`) on the left and icon buttons plus a `MoreHorizontal`
dropdown (`w-60 p-2`) on the right. The dropdown holds the status line, secondary nav, a theme row, and log out.

**Mobile tab bar:**

```tsx
<nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl lg:hidden">
  <ul className="mx-auto grid max-w-md grid-cols-5">
    <li>
      <Link className={cn(
        "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors",
        active && "text-foreground")}>
        <span className="relative">
          <Icon className={cn("size-5", active && "text-brand")} strokeWidth={active ? 2.25 : 1.9} />
          {/* optional CountBadge at absolute -top-1.5 -right-2.5 */}
        </span>
        Home
      </Link>
    </li>
  </ul>
</nav>
```

Tab labels use short names ("Home", "Activity", "Ask"). Main content keeps `pb-28` on
mobile so nothing hides behind the bar.

**Page rhythm:** start with a `PageHeader`, then a KPI grid (`gap-3 sm:gap-4`), then cards
separated by `mt-4 sm:mt-6`. Two-column rows use `grid gap-4 sm:gap-6 lg:grid-cols-5`
with `lg:col-span-3` + `lg:col-span-2`.

**Loading state:** a skeleton that mirrors the page layout (`Skeleton` = `animate-pulse rounded-md bg-muted`):

```tsx
<div aria-busy aria-label="Loading">
  <div className="mb-8 space-y-2">
    <Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72" />
  </div>
  <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
  </div>
  <Skeleton className="mt-6 h-96 rounded-2xl" />
  <div className="mt-6 grid gap-6 lg:grid-cols-5">
    <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
    <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
  </div>
</div>
```

### Auth / splash page

A centered card over a **brand glow + masked grid** backdrop:

```tsx
<main className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <div className="absolute top-[-20%] left-1/2 h-[36rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px] dark:bg-brand/25" />
    <div className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
      style={{
        backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
      }} />
  </div>
  <div className="relative w-full max-w-sm">
    <div className="mb-8 flex flex-col items-center text-center">
      {/* <LogoMark className="size-16" /> */}
      <h1 className="mt-5 text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to App</p>
    </div>
    <div className="rounded-2xl bg-card/80 p-6 shadow-xl ring-1 ring-border backdrop-blur-xl">{/* form */}</div>
    <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5" /> Reassuring one-liner
    </p>
  </div>
</main>
```

---

## 9. Charts (Recharts via shadcn `ChartContainer`)

**Palette:** use `var(--chart-1)` through `var(--chart-5)` in that order. Series 1 (indigo) is the
"primary / this period" color and series 3 (green) is income. `--viz-negative` is for
overspent / liabilities. Never use `brand` in charts.

**Shared rules:**
- `<CartesianGrid vertical={false} stroke="var(--viz-grid)" />`: horizontal gridlines only.
- Axes: `tickLine={false} axisLine={false}`. X gets `tickMargin={8}`. Y gets `width={52}` and a compact money formatter.
- Chart margins: `{ top: 8, right: 8, bottom: 0, left: 0 }`.
- Bars: `radius={[5, 5, 0, 0]}` (rounded data-end, square baseline), `maxBarSize` 22 for
  grouped bars and 36 for single ones. Animations off for bars (`isAnimationActive={false}`).
- Signed bars (positive and negative): round the end that points away from zero, and use chart-1 for positive and `--viz-negative` for negative. Add `<ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />`.
- Lines: `strokeWidth={2}` (comparison) / `2.25` (current, drawn as an `Area` with a soft fill),
  `dot={false}`, `activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}`. Mark the "today" point with a
  `ReferenceDot` stroked in `var(--card)`.
- Cursor: bars get `{ fill: "var(--muted)", opacity: 0.6 }`, lines get `{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }`.
- Donut: `innerRadius="72%" outerRadius="100%" paddingAngle={1.5} cornerRadius={6} stroke="none"`, start
  at the top (`startAngle={90} endAngle={-270}`), at most 6 slices, with the rest folded into "N more" in
  `var(--muted-foreground)`. Put the total in the center. Hovering dims the other slices.
- Chart heights: `h-[240px]` for cartesian charts, and `max-w-[18rem] aspect-square` for donuts.

**Custom tooltip** (matches shadcn's):

```tsx
<div className="grid min-w-44 gap-1.5 rounded-lg border border-border/60 bg-popover/95 px-2.5 py-2 text-xs shadow-xl backdrop-blur-sm">
  <div className="font-medium">Sep 2026</div>
  <div className="flex items-center gap-2">
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: "var(--chart-1)" }} />
    <span className="flex-1 text-muted-foreground">Spending</span>
    <span className="font-medium text-foreground tabular-nums">$1,234.56</span>
  </div>
</div>
```

**Custom legend:** `flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground`, each item
`inline-flex items-center gap-1.5` with a `size-2 rounded-[3px]` swatch.

**Proportion bar** (e.g. assets vs liabilities): `flex h-2 gap-0.5 overflow-hidden rounded-full`
with two spans (`rounded-l-full` / `rounded-r-full`) and a legend row underneath.

---

## 10. Formatting helpers

```ts
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
export const formatMoneyWhole = (n: number) => usdWhole.format(n);
export const formatMoneyCompact = (n: number) => (Math.abs(n) < 1000 ? usdWhole.format(n) : usdCompact.format(n));

/** "Today", "Yesterday", "Mon, Sep 21" (year added when not this year). */
export function formatDayHeading(iso: string, today: string): string { /* … */ }

/** "just now", "5m ago", "3h ago", "2d ago", else "Sep 21, 3:04 PM". */
export function formatRelative(date: Date, now = new Date()): string { /* … */ }
```

- Dates in lists: `Sep 21`. Dates in headings: `Mon, Sep 21`. Full dates: `Sep 21, 2026`.
- Ranges use an en dash: `Jul – Sep 2026`, `1–50 of 1,234`.
- Always use `…` (a single character) for ongoing states: "Syncing…".

---

## 11. Interaction & motion

- Transitions are `transition-colors` (links, rows, nav) or `transition-all` (buttons, segmented). There are no custom durations or entrance animations on pages.
- Buttons move down 1px when pressed (`active:translate-y-px`).
- Focus: `focus-visible:ring-3 ring-ring/50` (green). The base style sets `outline-ring/50` on everything.
- Hover on rows is `bg-muted/40`, never a border change.
- Pending server navigation: dim the affected region to `opacity-70`. Don't use spinners, except
  `Loader2 animate-spin` inside a button that is actively working.
- Tooltips open after a 300ms delay.
- Toasts appear top-center.
- Navigations that only change query params (filters, sorts, pagination) use `scroll={false}`.
- Touch: `-webkit-tap-highlight-color: transparent`, and the bottom UI respects `env(safe-area-inset-bottom)` via `pb-safe`.

---

## 12. Accessibility conventions

- Segmented and theme controls are `role="radiogroup"` with `role="radio"` + `aria-checked`.
- Icon-only buttons always get an `aria-label` (and a `title` for a hover hint).
- Decorative icons and color tiles get `aria-hidden`.
- Active nav items get `aria-current="page"`. Toggle buttons get `aria-pressed`.
- Loading regions get `aria-busy`.
- Color is never the only signal: deltas have arrows, statuses have text, and inflows have `+`.

---

## 13. Do / Don't

**Do**
- Wrap every content block in `.surface` or `<Card>`. The canvas itself never holds loose content, except the page header.
- Keep one `primary` (solid dark) button per view. Use `outline` for everything else.
- Keep text small: `text-sm` body, `text-xs` meta. Hierarchy comes from weight and color, not size.
- Use `.eyebrow` for any small uppercase label.
- Use `truncate` + `min-w-0` on every flexible text cell.

**Don't**
- Use pure gray. Every neutral carries the hue-160 tint.
- Use solid colored backgrounds for status. Tint at 10–15% instead.
- Put borders *and* shadows on inner elements. Only the outer surface gets the shadow, and inner groups get `border` or `bg-muted/50`.
- Use `brand` for large areas or chart series.
- Add custom fonts, gradients (other than the auth glow), or drop shadows beyond the three elevation levels.

---

## 14. Checklist for the receiving project

1. Install the packages in §1 and create `components.json`.
2. Replace `app/globals.css` with §2.
3. Set up fonts, viewport, theme script, `TooltipProvider`, and `Toaster` in the root layout (§4, §5).
4. `npx shadcn add …` the primitives, then apply the Card and Sonner overrides (§6).
5. Add `Segmented`, `ThemeToggle`, `PageHeader`, `EmptyState`, `IconTile`, `Money`, `Amount`, `DeltaPill`, `StatusChip`, and `SortHeader` (§7).
6. Build the shell: sidebar, mobile header, tab bar, main container (§8).
7. Plug in your logo where `<Logo />` / `<LogoMark />` appear.
8. Check both themes and a 375px-wide viewport.
