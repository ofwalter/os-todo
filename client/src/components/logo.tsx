import { useId } from "react";
import { cn } from "@/lib/utils";
import { LOGO_PATHS, LOGO_VIEWBOX } from "./logo-paths";

/** The OS Todo mark. Line art in currentColor, so it follows the app theme. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const maskId = `logo-mask-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="420" height="420">
        <rect width="420" height="420" fill="#000" />
        {LOGO_PATHS.map((p, i) =>
          p[0] === "F" ? (
            <path key={i} d={p.slice(1)} fill="#000" stroke="#000" strokeWidth={1} />
          ) : (
            <path key={i} d={p.slice(1)} fill="none" stroke="#fff" strokeWidth={16} strokeLinecap="round" />
          ),
        )}
      </mask>
      <rect width="420" height="420" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/** Mark plus wordmark, for the sidebar. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-8" />
      <span className="font-heading text-[0.9375rem] font-semibold tracking-tight">OS Todo</span>
    </span>
  );
}
