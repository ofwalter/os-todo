import { cn } from "@/lib/utils";

interface ProgressBarProps {
  progress: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

function getProgressColor(progress: number): string {
  if (progress >= 90) return "bg-emerald-500 dark:bg-emerald-400";
  if (progress >= 75) return "bg-lime-500 dark:bg-lime-400";
  if (progress >= 50) return "bg-amber-500 dark:bg-amber-400";
  if (progress >= 25) return "bg-orange-500 dark:bg-orange-400";
  if (progress > 0) return "bg-red-500 dark:bg-red-400";
  return "bg-gray-300 dark:bg-gray-600";
}

export function getProgressBgColor(progress: number): string {
  if (progress >= 90) return "bg-emerald-500/20 dark:bg-emerald-400/20";
  if (progress >= 75) return "bg-lime-500/20 dark:bg-lime-400/20";
  if (progress >= 50) return "bg-amber-500/20 dark:bg-amber-400/20";
  if (progress >= 25) return "bg-orange-500/20 dark:bg-orange-400/20";
  if (progress > 0) return "bg-red-500/20 dark:bg-red-400/20";
  return "bg-gray-200/50 dark:bg-gray-700/50";
}

export function getProgressDotColor(progress: number): string {
  if (progress >= 90) return "bg-emerald-500 dark:bg-emerald-400";
  if (progress >= 75) return "bg-lime-500 dark:bg-lime-400";
  if (progress >= 50) return "bg-amber-500 dark:bg-amber-400";
  if (progress >= 25) return "bg-orange-500 dark:bg-orange-400";
  if (progress > 0) return "bg-red-500 dark:bg-red-400";
  return "bg-gray-300 dark:bg-gray-600";
}

const sizeMap = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export function ProgressBar({
  progress,
  size = "md",
  showLabel = false,
  className,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex-1 rounded-full bg-muted/60",
          sizeMap[size],
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            getProgressColor(clampedProgress),
            clampedProgress === 0 && "invisible",
          )}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground tabular-nums min-w-[2.5rem] text-right">
          {clampedProgress}%
        </span>
      )}
    </div>
  );
}

interface MiniProgressBoxProps {
  progress: number;
  size?: number;
  className?: string;
}

export function MiniProgressBox({
  progress,
  size = 14,
  className,
}: MiniProgressBoxProps) {
  return (
    <div
      className={cn("rounded-sm", getProgressDotColor(progress), className)}
      style={{ width: size, height: size }}
      title={`${progress}%`}
    />
  );
}
