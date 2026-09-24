import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  GripVertical,
  Check,
  SkipForward,
  RotateCcw,
  ShieldOff,
  ShieldCheck,
  Clock,
  Plus,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusChip } from "@/components/app-ui";
import { cn } from "@/lib/utils";
import type { DailyTask, TaskStatus } from "@shared/schema";
import { playCompletionSound, playSkipSound, triggerConfetti, showFrownyFace } from "@/lib/sounds";

/** Horizontal space per nesting level, in px. */
export const INDENT = 22;

interface TaskItemProps {
  task: DailyTask;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onToggleCollapse: (id: number) => void;
  onToggleExempt: (id: number) => void;
  onCompleteDeadline?: (id: number) => void;
  onPutOffDeadline?: (id: number, days: number) => void;
  onUndoDeadline?: (id: number) => void;
  onAddChildOpen?: (id: number) => void;
  isFuture: boolean;
  isReadOnly?: boolean;
  isDndEnabled?: boolean;
  isHiddenDuringDrag?: boolean;
}

const DEADLINE_PREFIX = "[Deadline] ";

function displayTitle(task: DailyTask): string {
  return task.deadlineName && task.title.startsWith(DEADLINE_PREFIX)
    ? task.title.slice(DEADLINE_PREFIX.length)
    : task.title;
}

function renderTitle(title: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return title.split(urlRegex).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
        data-testid={`link-task-url-${i}`}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** The square status box at the start of every row. */
export function StatusBox({ task, isDeadline }: { task: DailyTask; isDeadline?: boolean }) {
  const base = "flex size-[1.125rem] items-center justify-center rounded-[5px] transition-colors";
  if (task.isExempt) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <ShieldCheck className="size-3" strokeWidth={2.5} />
      </span>
    );
  }
  switch (task.status) {
    case "complete":
      return (
        <span className={cn(base, "bg-brand text-brand-foreground")}>
          <Check className="size-3" strokeWidth={3.25} />
        </span>
      );
    case "skipped":
      return (
        <span className={cn(base, "bg-warning/15 text-amber-700 dark:text-warning")}>
          {isDeadline ? <Clock className="size-3" strokeWidth={2.5} /> : <SkipForward className="size-3" strokeWidth={2.5} />}
        </span>
      );
    case "partial":
      return (
        <span className={cn(base, "relative overflow-hidden text-brand-foreground")}>
          <span className="absolute inset-0 bg-brand" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
          <span className="absolute inset-0 bg-warning" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
          <Check className="relative size-3" strokeWidth={3.25} />
        </span>
      );
    default:
      return (
        <span
          className={cn(
            base,
            "border-[1.5px] border-muted-foreground/35 bg-card group-hover/status:border-brand group-hover/status:bg-brand/10",
          )}
        />
      );
  }
}

export function TaskItem({
  task,
  depth,
  hasChildren,
  isCollapsed,
  onStatusChange,
  onToggleCollapse,
  onToggleExempt,
  onCompleteDeadline,
  onPutOffDeadline,
  onUndoDeadline,
  onAddChildOpen,
  isFuture,
  isReadOnly = false,
  isDndEnabled = false,
  isHiddenDuringDrag = false,
}: TaskItemProps) {
  // Hover state doubles as "tapped" on touch screens, where rows have no hover.
  const [isHovered, setIsHovered] = useState(false);
  const [putOffOpen, setPutOffOpen] = useState(false);
  const [putOffDays, setPutOffDays] = useState("1");

  const isDeadline = !!task.deadlineName;
  const isDone = task.status === "complete" || task.status === "skipped";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !isDndEnabled,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const undo = () => {
    if (isDeadline && onUndoDeadline) onUndoDeadline(task.id);
    else onStatusChange(task.id, "incomplete");
  };

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (task.status === "complete") return undo();
    playCompletionSound();
    triggerConfetti();
    if (isDeadline && onCompleteDeadline) onCompleteDeadline(task.id);
    else onStatusChange(task.id, "complete");
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (task.status === "skipped") return undo();
    playSkipSound();
    showFrownyFace();
    onStatusChange(task.id, "skipped");
  };

  const handlePutOff = () => {
    const days = parseInt(putOffDays);
    if (isNaN(days) || days < 1) return;
    playSkipSound();
    showFrownyFace();
    onPutOffDeadline?.(task.id, days);
    setPutOffOpen(false);
    setPutOffDays("1");
  };

  // The box toggles completion; skipped rows reset to incomplete.
  const handleStatusBox = (e: React.MouseEvent) => {
    if (task.status === "skipped") {
      e.stopPropagation();
      undo();
    } else {
      handleComplete(e);
    }
  };

  const canAct = !isReadOnly && !isFuture;
  const showActions = isHovered || putOffOpen;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex min-h-10 items-center gap-1 py-1 pr-2 pl-1 transition-colors hover:bg-muted/40 sm:pr-3",
        (isDragging || isHiddenDuringDrag) && "pointer-events-none opacity-0",
        task.status === "skipped" && "opacity-55",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsHovered(false);
      }}
      data-testid={`task-item-${task.id}`}
    >
      {isDndEnabled ? (
        <button
          type="button"
          className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-${task.id}`}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : (
        <span className="w-1 shrink-0" />
      )}

      <span style={{ width: depth * INDENT }} className="shrink-0" aria-hidden />

      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggleCollapse(task.id)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          aria-expanded={!isCollapsed}
          data-testid={`collapse-toggle-${task.id}`}
        >
          <ChevronRight className={cn("size-4 transition-transform", !isCollapsed && "rotate-90")} />
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}

      <button
        type="button"
        onClick={handleStatusBox}
        disabled={!canAct || task.isExempt}
        className="group/status flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
        aria-label={task.status === "complete" ? "Mark incomplete" : task.status === "skipped" ? "Undo skip" : "Complete"}
        data-testid={`status-box-${task.id}`}
      >
        <StatusBox task={task} isDeadline={isDeadline} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-1">
        <span
          className={cn(
            "min-w-0 text-sm leading-snug break-words select-none",
            hasChildren && depth === 0 && "font-medium",
            task.status === "complete" && "text-muted-foreground line-through decoration-muted-foreground/40",
            task.status === "skipped" && "text-muted-foreground italic line-through decoration-muted-foreground/40",
            task.status === "partial" && "text-muted-foreground",
            task.isExempt && "text-muted-foreground",
          )}
          data-testid={`task-title-${task.id}`}
        >
          {renderTitle(displayTitle(task))}
        </span>
        {isDeadline && (
          <StatusChip tone={task.status === "skipped" ? "warning" : "brand"}>
            <CalendarClock />
            Due
          </StatusChip>
        )}
        {task.isExempt && <StatusChip>Exempt</StatusChip>}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity",
          showActions ? "opacity-100" : "opacity-0",
          isDone && canAct && "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
        )}
      >
        {canAct &&
          (isDone ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                undo();
              }}
              className="text-muted-foreground"
              title="Undo"
              aria-label="Undo"
              data-testid={`undo-${task.id}`}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleComplete}
                className="text-positive hover:bg-positive/12 hover:text-positive"
                title="Complete"
                aria-label="Complete"
                data-testid={`complete-${task.id}`}
              >
                <Check className="size-4" strokeWidth={2.5} />
              </Button>
              {isDeadline ? (
                <Popover open={putOffOpen} onOpenChange={setPutOffOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={(e) => e.stopPropagation()}
                      className="text-amber-700 hover:bg-warning/15 hover:text-amber-700 dark:text-warning dark:hover:text-warning"
                      title="Put off"
                      aria-label="Put off"
                      data-testid={`putoff-${task.id}`}
                    >
                      <Clock className="size-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="end" onClick={(e) => e.stopPropagation()}>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Put off for how many days?</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={putOffDays}
                        onChange={(e) => setPutOffDays(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handlePutOff();
                        }}
                        className="tabular-nums"
                        data-testid={`input-putoff-days-${task.id}`}
                        autoFocus
                      />
                      <Button onClick={handlePutOff} data-testid={`button-putoff-confirm-${task.id}`}>
                        Put off
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-amber-700 hover:bg-warning/15 hover:text-amber-700 dark:text-warning dark:hover:text-warning"
                  title="Skip"
                  aria-label="Skip"
                  data-testid={`skip-${task.id}`}
                >
                  <SkipForward className="size-3.5" />
                </Button>
              )}
            </>
          ))}

        {isFuture && !isReadOnly && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onToggleExempt(task.id)}
            className={cn("text-muted-foreground", task.isExempt && "text-foreground")}
            title={task.isExempt ? "Remove exemption" : "Exempt from progress"}
            aria-label={task.isExempt ? "Remove exemption" : "Exempt from progress"}
            aria-pressed={task.isExempt}
            data-testid={`exempt-toggle-${task.id}`}
          >
            {task.isExempt ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          </Button>
        )}

        {!isReadOnly && onAddChildOpen && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onAddChildOpen(task.id);
            }}
            className="text-muted-foreground"
            title="Add subtask"
            aria-label="Add subtask"
            data-testid={`add-child-btn-${task.id}`}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function TaskItemOverlay({ task, depth, hasChildren }: { task: DailyTask; depth: number; hasChildren: boolean }) {
  return (
    <div className="flex min-h-10 items-center gap-1 py-1 pr-3 pl-1">
      <span className="flex w-5 justify-center text-muted-foreground/70">
        <GripVertical className="size-3.5" />
      </span>
      <span style={{ width: depth * INDENT }} className="shrink-0" />
      {hasChildren ? (
        <span className="flex size-6 items-center justify-center text-muted-foreground">
          <ChevronRight className="size-4 rotate-90" />
        </span>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <span className="flex size-7 items-center justify-center">
        <StatusBox task={task} isDeadline={!!task.deadlineName} />
      </span>
      <span
        className={cn(
          "flex-1 pl-1 text-sm leading-snug select-none",
          hasChildren && depth === 0 && "font-medium",
          (task.status === "complete" || task.status === "skipped") && "text-muted-foreground line-through",
        )}
      >
        {displayTitle(task)}
      </span>
    </div>
  );
}
