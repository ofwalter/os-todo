import type { LucideIcon } from "lucide-react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  titleTestId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleTestId?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]" data-testid={titleTestId}>
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}
      data-testid={testId}
    >
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

/** Card section header: 15px heading title, xs muted subtitle, optional right-side controls. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  short?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  testId?: string;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "sm",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 scrollbar-none",
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.title}
            onClick={() => onChange(o.value)}
            data-testid={o.testId}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-6 px-2 text-[0.6875rem]",
              selected && "bg-background text-foreground shadow-sm dark:bg-input/40",
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {o.short ? (
              <>
                <span className="sm:hidden">{o.short}</span>
                <span className="hidden sm:inline">{o.label}</span>
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const pref = useThemePreference();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
      data-testid="theme-toggle"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => setThemePreference(value)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:text-foreground",
            pref === value && "bg-background text-foreground shadow-sm dark:bg-input/40",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Tiny uppercase status label next to a row title. */
export function StatusChip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "brand" | "positive" | "negative";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] shrink-0 items-center gap-1 rounded-md px-1.5 text-[0.625rem] font-semibold tracking-wide uppercase [&_svg]:size-2.5",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "warning" && "bg-warning/15 text-amber-700 dark:text-warning",
        tone === "brand" && "bg-brand/10 text-brand",
        tone === "positive" && "bg-chart-3/12 text-positive",
        tone === "negative" && "bg-negative/12 text-negative",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kpi({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface flex flex-col gap-2.5 p-4 sm:p-5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-semibold text-brand-foreground tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
