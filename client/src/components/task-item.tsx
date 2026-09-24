import { useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  Check,
  SkipForward,
  RotateCcw,
  ShieldOff,
  ShieldCheck,
  Clock,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DailyTask, TaskStatus } from "@shared/schema";
import {
  playCompletionSound,
  playSkipSound,
  triggerConfetti,
  showFrownyFace,
} from "@/lib/sounds";

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

function renderTitle(title: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = title.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/40 hover:decoration-primary"
          data-testid={`link-task-url-${i}`}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
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
  const [isHovered, setIsHovered] = useState(false);
  const [putOffOpen, setPutOffOpen] = useState(false);
  const [putOffDays, setPutOffDays] = useState("1");
  const itemRef = useRef<HTMLDivElement>(null);

  const isDeadline = !!task.deadlineName;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !isDndEnabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;

    if (task.status === "complete") {
      if (isDeadline && onUndoDeadline) {
        onUndoDeadline(task.id);
      } else {
        onStatusChange(task.id, "incomplete");
      }
      return;
    }

    playCompletionSound();
    triggerConfetti();

    if (isDeadline && onCompleteDeadline) {
      onCompleteDeadline(task.id);
    } else {
      onStatusChange(task.id, "complete");
    }
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;

    if (task.status === "skipped") {
      if (isDeadline && onUndoDeadline) {
        onUndoDeadline(task.id);
      } else {
        onStatusChange(task.id, "incomplete");
      }
      return;
    }

    playSkipSound();
    showFrownyFace();
    onStatusChange(task.id, "skipped");
  };

  const handlePutOff = () => {
    const days = parseInt(putOffDays);
    if (isNaN(days) || days < 1) return;

    playSkipSound();
    showFrownyFace();

    if (onPutOffDeadline) {
      onPutOffDeadline(task.id, days);
    }
    setPutOffOpen(false);
    setPutOffDays("1");
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeadline && onUndoDeadline) {
      onUndoDeadline(task.id);
    } else {
      onStatusChange(task.id, "incomplete");
    }
  };

  const statusIcon = () => {
    if (task.isExempt) {
      return (
        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-violet-100 dark:bg-violet-900/40 text-violet-500 dark:text-violet-400">
          <ShieldCheck className="w-3.5 h-3.5" />
        </div>
      );
    }

    switch (task.status) {
      case "complete":
        return (
          <div className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-500 dark:bg-emerald-500 text-white">
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </div>
        );
      case "skipped":
        return (
          <div className={cn(
            "w-5 h-5 rounded-md flex items-center justify-center text-white",
            isDeadline ? "bg-orange-400 dark:bg-orange-500" : "bg-amber-400 dark:bg-amber-500",
          )}>
            {isDeadline ? <Clock className="w-3 h-3" /> : <SkipForward className="w-3 h-3" />}
          </div>
        );
      case "partial":
        return (
          <div className="w-5 h-5 rounded-md flex items-center justify-center overflow-hidden relative">
            <div className="absolute inset-0 bg-emerald-500" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
            <div className="absolute inset-0 bg-amber-400 dark:bg-amber-500" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
            <Check className="w-3.5 h-3.5 text-white relative z-10" strokeWidth={3} />
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center" />
        );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 py-1 px-2 rounded-md transition-colors duration-100",
        (isDragging || isHiddenDuringDrag) && "opacity-0 pointer-events-none",
        isHovered && "bg-accent/50",
        task.status === "complete" && "opacity-75",
        task.status === "skipped" && "opacity-50",
        task.status === "partial" && "opacity-60",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`task-item-${task.id}`}
    >
      {isDndEnabled && (
        <div
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-${task.id}`}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      <div style={{ width: depth * 20 }} className="flex-shrink-0" />

      {hasChildren ? (
        <button
          onClick={() => onToggleCollapse(task.id)}
          className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          data-testid={`collapse-toggle-${task.id}`}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      ) : (
        <div className="w-5 flex-shrink-0" />
      )}

      <div className="flex-shrink-0">{statusIcon()}</div>

      <span
        ref={itemRef}
        className={cn(
          "flex-1 text-sm leading-relaxed select-none",
          task.status === "complete" && "line-through text-muted-foreground",
          task.status === "skipped" &&
            "line-through text-muted-foreground italic",
          task.status === "partial" && "text-muted-foreground",
          task.isExempt && "text-violet-600 dark:text-violet-400",
        )}
        data-testid={`task-title-${task.id}`}
      >
        {renderTitle(task.title)}
      </span>

      {!isReadOnly && !isFuture && (
        <div
          className={cn(
            "flex items-center gap-0.5 transition-opacity duration-100",
            isHovered || (task.status !== "incomplete" && task.status !== "partial") ? "opacity-100" : "opacity-0",
          )}
        >
          {task.status === "complete" || task.status === "skipped" ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleUndo}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Undo"
              data-testid={`undo-${task.id}`}
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleComplete}
                className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                title="Complete"
                data-testid={`complete-${task.id}`}
              >
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              </Button>
              {isDeadline ? (
                <Popover open={putOffOpen} onOpenChange={setPutOffOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 w-6 text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                      title="Put off"
                      data-testid={`putoff-${task.id}`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-52 p-3"
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs font-medium mb-2">Put off for how many days?</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={putOffDays}
                        onChange={(e) => setPutOffDays(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handlePutOff();
                        }}
                        className="h-7 text-sm"
                        data-testid={`input-putoff-days-${task.id}`}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={handlePutOff}
                        className="h-7 px-3 text-xs"
                        data-testid={`button-putoff-confirm-${task.id}`}
                      >
                        Go
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSkip}
                  className="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                  title="Skip"
                  data-testid={`skip-${task.id}`}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {isFuture && !isReadOnly && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onToggleExempt(task.id)}
          className={cn(
            "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
            task.isExempt && "opacity-100",
          )}
          title={task.isExempt ? "Remove exemption" : "Exempt from progress"}
          data-testid={`exempt-toggle-${task.id}`}
        >
          {task.isExempt ? (
            <ShieldOff className="w-3.5 h-3.5" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" />
          )}
        </Button>
      )}

      {!isReadOnly && onAddChildOpen && (
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onAddChildOpen(task.id);
          }}
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Add child task"
          data-testid={`add-child-btn-${task.id}`}
        >
          <Plus className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

export function TaskItemOverlay({
  task,
  depth,
  hasChildren,
}: {
  task: DailyTask;
  depth: number;
  hasChildren: boolean;
}) {
  const statusIcon = () => {
    switch (task.status) {
      case "complete":
        return (
          <div className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-500 text-white">
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </div>
        );
      case "skipped":
        return (
          <div className="w-5 h-5 rounded-md flex items-center justify-center bg-amber-400 text-white">
            <SkipForward className="w-3 h-3" />
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600" />
        );
    }
  };

  return (
    <div className="flex items-center gap-1 py-1 px-2">
      <GripVertical className="w-4 h-4 text-muted-foreground/40" />
      <div style={{ width: depth * 20 }} className="flex-shrink-0" />
      {hasChildren ? (
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      ) : (
        <div className="w-5 flex-shrink-0" />
      )}
      <div className="flex-shrink-0">{statusIcon()}</div>
      <span
        className={cn(
          "flex-1 text-sm leading-relaxed select-none",
          task.status === "complete" && "line-through text-muted-foreground",
          task.status === "skipped" && "line-through text-muted-foreground italic",
        )}
      >
        {task.title}
      </span>
    </div>
  );
}
