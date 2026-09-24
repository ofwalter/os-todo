import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { useRoute } from "wouter";
import { Eye, EyeOff, Calendar, ChevronsDownUp, ChevronsUpDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProgressBar } from "@/components/progress-bar";
import { TaskTree } from "@/components/task-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient as qc } from "@/lib/queryClient";
import type { DailyTask, TaskStatus } from "@shared/schema";

function cascadeChildren(tasks: DailyTask[], parentId: number, status: string): DailyTask[] {
  let updated = [...tasks];
  const children = updated.filter((t) => t.parentId === parentId);
  for (const child of children) {
    updated = updated.map((t) => (t.id === child.id ? { ...t, status } : t));
    updated = cascadeChildren(updated, child.id, status);
  }
  return updated;
}

function computeParentStatus(tasks: DailyTask[], parentId: number): string {
  const siblings = tasks.filter((t) => t.parentId === parentId);
  if (siblings.length === 0) return "incomplete";

  const eff = (s: DailyTask) => s.isExempt ? "complete" : s.status;
  const allDone = siblings.every(
    (s) => eff(s) === "complete" || eff(s) === "skipped" || eff(s) === "partial",
  );
  const allSkipped = siblings.every((s) => eff(s) === "skipped");
  const allComplete = siblings.every((s) => eff(s) === "complete");
  const hasComplete = siblings.some((s) => eff(s) === "complete" || eff(s) === "partial");
  const hasSkipped = siblings.some((s) => eff(s) === "skipped" || eff(s) === "partial");

  if (allSkipped) return "skipped";
  if (allComplete) return "complete";
  if (allDone && hasComplete && hasSkipped) return "partial";
  if (allDone && hasComplete) return "complete";
  if (allDone && hasSkipped) return "skipped";
  return "incomplete";
}

function applyOptimisticParentStatus(tasks: DailyTask[], taskId: number, newStatus: string): DailyTask[] {
  const parentIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId));
  const hasChildren = parentIds.has(taskId);
  let updated = [...tasks];

  if (hasChildren && (newStatus === "complete" || newStatus === "skipped")) {
    updated = cascadeChildren(updated, taskId, newStatus);
  }

  const task = updated.find((t) => t.id === taskId);
  if (!task?.parentId) return updated;

  let currentId = taskId;
  let current = updated.find((t) => t.id === currentId);
  while (current?.parentId) {
    const parentStatus = computeParentStatus(updated, current.parentId);
    updated = updated.map((t) => (t.id === current!.parentId ? { ...t, status: parentStatus } : t));
    currentId = current.parentId;
    current = updated.find((t) => t.id === currentId);
  }
  return updated;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );

  const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (diff === 0) return `Today - ${dayName}, ${monthDay}`;
  if (diff === 1) return `Yesterday - ${dayName}, ${monthDay}`;
  if (diff === -1) return `Tomorrow - ${dayName}, ${monthDay}`;
  if (diff < -1) return `${dayName}, ${monthDay} (in ${Math.abs(diff)} days)`;
  return `${dayName}, ${monthDay} (${diff} days ago)`;
}

function computeProgress(tasks: DailyTask[]): number {
  const parentIds = new Set(
    tasks.filter((t) => t.parentId).map((t) => t.parentId),
  );
  const leaves = tasks.filter((t) => !parentIds.has(t.id));
  const countable = leaves.filter((t) => !t.isExempt);
  if (countable.length === 0) return 0;
  const completed = countable.filter((t) => t.status === "complete").length;
  return Math.round((completed / countable.length) * 100);
}

function computeStats(tasks: DailyTask[]) {
  const parentIds = new Set(
    tasks.filter((t) => t.parentId).map((t) => t.parentId),
  );
  const leaves = tasks.filter((t) => !parentIds.has(t.id));
  const countable = leaves.filter((t) => !t.isExempt);
  return {
    total: countable.length,
    completed: countable.filter((t) => t.status === "complete").length,
    skipped: countable.filter((t) => t.status === "skipped").length,
    incomplete: countable.filter((t) => t.status === "incomplete").length,
    exempt: leaves.filter((t) => t.isExempt).length,
  };
}

export default function TodayPage() {
  const [, params] = useRoute("/day/:date");
  const date = params?.date || getTodayStr();
  const isToday = date === getTodayStr();
  const isFuture = new Date(date + "T00:00:00") > new Date(new Date().toDateString());
  const [hideCompleted, setHideCompleted] = useState(
    () => localStorage.getItem("hideCompleted") === "true",
  );

  const toggleHideCompleted = (value: boolean) => {
    setHideCompleted(value);
    localStorage.setItem("hideCompleted", String(value));
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pendingReorderRef = useRef<{
    tempId: number;
    items: { id: number; position: number; parentId: number | null }[];
  } | null>(null);

  const { data: tasks, isLoading } = useQuery<DailyTask[]>({
    queryKey: ["/api/days", date, "tasks"],
  });

  const updateTask = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Partial<DailyTask>;
    }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, data);
      return res.json();
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      if (previous) {
        let updated = previous.map((t) => (t.id === id ? { ...t, ...data } : t));
        if (data.status) {
          updated = applyOptimisticParentStatus(updated, id, data.status);
        } else if (data.isExempt !== undefined) {
          const task = updated.find((t) => t.id === id);
          if (task?.parentId) {
            let currentId = id;
            let current = updated.find((t) => t.id === currentId);
            while (current?.parentId) {
              const parentStatus = computeParentStatus(updated, current.parentId);
              updated = updated.map((t) => (t.id === current!.parentId ? { ...t, status: parentStatus } : t));
              currentId = current.parentId;
              current = updated.find((t) => t.id === currentId);
            }
          }
        }
        queryClient.setQueryData(["/api/days", date, "tasks"], updated);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/streaks"] });
    },
  });

  const addTask = useMutation({
    mutationFn: async ({ title, parentId }: { title: string; parentId?: number | null }) => {
      const res = await apiRequest("POST", `/api/days/${date}/tasks`, {
        title,
        parentId: parentId ?? null,
      });
      return res.json() as Promise<DailyTask>;
    },
    onMutate: async ({ title, parentId }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      const tempId = -(Date.now());
      const tempTask: DailyTask = {
        id: tempId,
        userId: 0,
        date,
        title,
        parentId: parentId ?? null,
        status: "incomplete",
        position: (previous?.length ?? 0),
        isExempt: false,
        isCollapsed: false,
        templateTaskId: null,
        deadlineName: null,
        deadlineRepetition: null,
        deadlineOriginalDate: null,
        deadlinePutOffDays: null,
        deadlineBucket: null,
        deadlineId: null,
      };
      queryClient.setQueryData<DailyTask[]>(
        ["/api/days", date, "tasks"],
        [...(previous ?? []), tempTask],
      );
      return { previous, tempId };
    },
    onError: (_err, _vars, context) => {
      pendingReorderRef.current = null;
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
    },
    onSettled: async (realTask, _error, _vars, context) => {
      if (realTask && context?.tempId) {
        const pending = pendingReorderRef.current;
        if (pending?.tempId === context.tempId) {
          pendingReorderRef.current = null;
          const fixedItems = pending.items.map((item) =>
            item.id === pending.tempId ? { ...item, id: (realTask as DailyTask).id } : item,
          );
          try {
            await apiRequest("POST", `/api/days/${date}/reorder`, { items: fixedItems });
          } catch {
            // reorder failed; positions may be off but task is present
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
    },
  });

  const reorderTasks = useMutation({
    mutationFn: async (
      items: { id: number; position: number; parentId: number | null }[],
    ) => {
      const tempItem = items.find((i) => i.id < 0);
      if (tempItem) {
        // Task not yet confirmed by server — store the full reorder for later
        pendingReorderRef.current = { tempId: tempItem.id, items };
        // Only send real items so the server stays consistent
        const realItems = items.filter((i) => i.id > 0);
        if (realItems.length === 0) return {};
        const res = await apiRequest("POST", `/api/days/${date}/reorder`, { items: realItems });
        return res.json();
      }
      const res = await apiRequest("POST", `/api/days/${date}/reorder`, { items });
      return res.json();
    },
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      if (previous) {
        const updates = new Map(items.map((i) => [i.id, i]));
        const updated = previous.map((t) => {
          const u = updates.get(t.id);
          if (u) {
            return { ...t, position: u.position, parentId: u.parentId };
          }
          return t;
        });
        queryClient.setQueryData(["/api/days", date, "tasks"], updated);
      }
      return { previous };
    },
    onError: (_err, _items, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
    },
  });

  const completeDeadline = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/complete-deadline`);
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      if (previous) {
        let updated = previous.map((t) => (t.id === id ? { ...t, status: "complete" } : t));
        updated = applyOptimisticParentStatus(updated, id, "complete");
        queryClient.setQueryData(["/api/days", date, "tasks"], updated);
      }
      return { previous };
    },
    onError: (error: any, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
      toast({
        title: "Failed to complete deadline",
        description: error.message || "Could not update deadline",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/streaks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
    },
  });

  const putOffDeadline = useMutation({
    mutationFn: async ({ id, days }: { id: number; days: number }) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/putoff-deadline`, { days });
      return res.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      if (previous) {
        let updated = previous.map((t) => (t.id === id ? { ...t, status: "skipped" } : t));
        updated = applyOptimisticParentStatus(updated, id, "skipped");
        queryClient.setQueryData(["/api/days", date, "tasks"], updated);
      }
      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
      toast({
        title: "Failed to put off deadline",
        description: error.message || "Could not update deadline",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/streaks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
    },
  });

  const undoDeadline = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/undo-deadline`);
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      if (previous) {
        let updated = previous.map((t) => (t.id === id ? { ...t, status: "incomplete" } : t));
        updated = applyOptimisticParentStatus(updated, id, "incomplete");
        queryClient.setQueryData(["/api/days", date, "tasks"], updated);
      }
      return { previous };
    },
    onError: (error: any, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
      toast({
        title: "Failed to undo deadline",
        description: error.message || "Could not update deadline",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/streaks"] });
    },
  });

  const handleStatusChange = (id: number, status: TaskStatus) => {
    updateTask.mutate({ id, data: { status } });
  };

  const handleToggleCollapse = (id: number) => {
    const task = tasks?.find((t) => t.id === id);
    if (task) {
      updateTask.mutate({
        id,
        data: { isCollapsed: !task.isCollapsed },
      });
    }
  };

  const handleToggleExempt = (id: number) => {
    const task = tasks?.find((t) => t.id === id);
    if (task) {
      updateTask.mutate({
        id,
        data: { isExempt: !task.isExempt },
      });
    }
  };

  const setCollapseAll = useMutation({
    mutationFn: async (isCollapsed: boolean) => {
      const res = await apiRequest("POST", `/api/days/${date}/set-collapse`, { isCollapsed });
      return res.json();
    },
    onMutate: async (isCollapsed) => {
      await queryClient.cancelQueries({ queryKey: ["/api/days", date, "tasks"] });
      const previous = queryClient.getQueryData<DailyTask[]>(["/api/days", date, "tasks"]);
      if (previous) {
        const parentIds = new Set(previous.filter((t) => t.parentId).map((t) => t.parentId));
        queryClient.setQueryData(
          ["/api/days", date, "tasks"],
          previous.map((t) => (parentIds.has(t.id) ? { ...t, isCollapsed } : t)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/days", date, "tasks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
    },
  });

  const resetDay = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/days/${date}/reset`);
      return res.json() as Promise<DailyTask[]>;
    },
    onSuccess: (freshTasks) => {
      queryClient.setQueryData(["/api/days", date, "tasks"], freshTasks);
      toast({ title: "Day reset", description: "Tasks reloaded from the current template." });
    },
    onError: () => {
      toast({ title: "Reset failed", description: "Could not reset tasks.", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/days", date, "tasks"] });
    },
  });

  const hasParentTasks = useMemo(() => {
    if (!tasks) return false;
    const parentIds = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId));
    return parentIds.size > 0;
  }, [tasks]);

  const progress = useMemo(
    () => (tasks ? computeProgress(tasks) : 0),
    [tasks],
  );
  const stats = useMemo(
    () => (tasks ? computeStats(tasks) : null),
    [tasks],
  );

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-5 h-5 text-primary" />
          <h1
            className="text-lg font-semibold tracking-tight"
            data-testid="text-date-title"
          >
            {formatDateDisplay(date)}
          </h1>
        </div>

        {isFuture && (
          <p className="text-xs text-muted-foreground mt-1 ml-7">
            This is a future day. Hover over tasks and click the shield icon to exempt them from progress tracking.
          </p>
        )}

        <div className="mt-3 space-y-1.5">
          <ProgressBar
            progress={progress}
            size="lg"
            showLabel
            className="w-full"
          />
          {stats && stats.total > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span data-testid="text-completed-count">
                {stats.completed} completed
              </span>
              <span data-testid="text-incomplete-count">
                {stats.incomplete} remaining
              </span>
              {stats.skipped > 0 && (
                <span data-testid="text-skipped-count">
                  {stats.skipped} skipped
                </span>
              )}
              {stats.exempt > 0 && (
                <span data-testid="text-exempt-count">
                  {stats.exempt} exempt
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Tasks</h2>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                disabled={resetDay.isPending}
                data-testid="button-reset-day"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset day?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all current tasks for this day and reload them fresh from the template. Any custom tasks, completions, or edits will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => resetDay.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="flex items-center gap-1">
          {hasParentTasks && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollapseAll.mutate(true)}
                disabled={setCollapseAll.isPending}
                className="h-7 px-2 text-xs"
                data-testid="button-collapse-all"
              >
                <ChevronsDownUp className="w-3.5 h-3.5 mr-1" />
                Collapse
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollapseAll.mutate(false)}
                disabled={setCollapseAll.isPending}
                className="h-7 px-2 text-xs"
                data-testid="button-expand-all"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 mr-1" />
                Expand
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleHideCompleted(!hideCompleted)}
            data-testid="button-toggle-hide"
          >
            {hideCompleted ? (
              <>
                <Eye className="w-4 h-4 mr-1.5" />
                Show all
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4 mr-1.5" />
                Hide done
              </>
            )}
          </Button>
        </div>
      </div>

      <TaskTree
        tasks={tasks || []}
        onStatusChange={handleStatusChange}
        onToggleCollapse={handleToggleCollapse}
        onToggleExempt={handleToggleExempt}
        onReorder={(items) => reorderTasks.mutate(items)}
        onAddTask={(title) => addTask.mutate({ title })}
        onAddChildTask={(parentId, title) => addTask.mutate({ title, parentId })}
        onCompleteDeadline={(id) => completeDeadline.mutate(id)}
        onPutOffDeadline={(id, days) => putOffDeadline.mutate({ id, days })}
        onUndoDeadline={(id) => undoDeadline.mutate(id)}
        hideCompleted={hideCompleted}
        isFuture={isFuture}
      />
    </div>
  );
}
