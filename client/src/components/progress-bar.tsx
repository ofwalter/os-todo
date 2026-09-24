import { cn } from "@/lib/utils";

/**
 * Sequential heat scale for a day's completion: one hue (positive) at rising
 * strength, so "more green" always means "more done". `undefined` = no data.
 */
export function getProgressDotColor(progress: number | undefined): string {
  if (progress === undefined) return "bg-muted";
  if (progress >= 90) return "bg-positive";
  if (progress >= 75) return "bg-positive/75";
  if (progress >= 50) return "bg-positive/50";
  if (progress >= 25) return "bg-positive/30";
  if (progress > 0) return "bg-positive/15";
  return "bg-muted-foreground/20";
}

export const PROGRESS_LEGEND: { label: string; className: string }[] = [
  { label: "No data", className: getProgressDotColor(undefined) },
  { label: "0%", className: getProgressDotColor(0) },
  { label: "1–24%", className: getProgressDotColor(1) },
  { label: "25–49%", className: getProgressDotColor(25) },
  { label: "50–74%", className: getProgressDotColor(50) },
  { label: "75–89%", className: getProgressDotColor(75) },
  { label: "90%+", className: getProgressDotColor(90) },
];

const sizeMap = {
  sm: "h-1.5",
  md: "h-2",
  lg: "h-2.5",
};

export function ProgressBar({
  progress,
  size = "md",
  className,
}: {
  progress: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("w-full overflow-hidden rounded-full bg-muted", sizeMap[size], className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          clamped >= 100 ? "bg-positive" : "bg-brand",
          clamped === 0 && "invisible",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
