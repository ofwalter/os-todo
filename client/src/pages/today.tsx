import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, EyeOff, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kpi, PageHeader, SectionHeader } from "@/components/app-ui";
import { ProgressBar } from "@/components/progress-bar";
import { TaskTree } from "@/components/task-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { daysFromToday, parseDateStr, toDateStr, todayStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
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

function relativeDayLabel(dateStr: string): string {
  const diff = daysFromToday(dateStr);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function dayHref(dateStr: string): string {
  return dateStr === todayStr() ? "/" : `/day/${dateStr}`;
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
  const date = params?.date || todayStr();
  const isToday = date === todayStr();
  const isFuture = new Date(date + "T00:00:00") > new Date(new Date().toDateString());
  const [hideCompleted, setHideCompleted] = useState(
    () => localStorage.getItem("hideCompleted") === "true",
  );

  const toggleHideCompleted = (value: boolean) => {
    setHideCompleted(value);
    localStorage.setItem("hideCompleted", String(value));
  };
  const queryClient = useQueryClient();
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
      toast.error("Failed to complete deadline", { description: error.message || "Could not update deadline" });
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
      toast.error("Failed to put off deadline", { description: error.message || "Could not update deadline" });
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
      toast.error("Failed to undo deadline", { description: error.message || "Could not update deadline" });
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
      toast.success("Day reset", { description: "Tasks reloaded from the current template." });
    },
    onError: () => {
      toast.error("Reset failed", { description: "Could not reset tasks." });
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

  const dateObj = parseDateStr(date);
  const year = dateObj.getFullYear() !== new Date().getFullYear() ? `, ${dateObj.getFullYear()}` : "";
  const title = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + year;

  const header = (
    <PageHeader
      eyebrow={relativeDayLabel(date)}
      title={title}
      titleTestId="text-date-title"
      description={isFuture ? "A future day. Use the shield on a task to exempt it from progress." : undefined}
      actions={
        <>
          {!isToday && (
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="button-go-today">
              Today
            </Link>
          )}
          <Link
            href={dayHref(shiftDate(date, -1))}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Previous day"
            title="Previous day"
            data-testid="button-prev-day"
          >
            <ChevronLeft />
          </Link>
          <Link
            href={dayHref(shiftDate(date, 1))}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Next day"
            title="Next day"
            data-testid="button-next-day"
          >
            <ChevronRight />
          </Link>
        </>
      }
    />
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl" aria-busy aria-label="Loading">
        <div className="mb-8 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-96 rounded-2xl sm:mt-6" />
      </div>
    );
  }

  const total = stats?.total ?? 0;
  const bigNum = "num text-[1.75rem] leading-none font-semibold sm:text-3xl";

  return (
    <div className="mx-auto max-w-4xl">
      {header}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Progress" className="col-span-3 sm:col-span-1">
          <p className={bigNum} data-testid="text-progress">
            {progress}
            <span className="text-[0.6em] text-muted-foreground">%</span>
          </p>
          <ProgressBar progress={progress} size="sm" />
        </Kpi>
        <Kpi label="Completed">
          <p className={bigNum} data-testid="text-completed-count">
            {stats?.completed ?? 0}
            <span className="text-[0.6em] text-muted-foreground">/{total}</span>
          </p>
          <p className="text-xs text-muted-foreground">tasks done</p>
        </Kpi>
        <Kpi label="Remaining">
          <p className={bigNum} data-testid="text-incomplete-count">
            {stats?.incomplete ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats?.incomplete ? "still to do" : total ? "all clear" : "no tasks"}
          </p>
        </Kpi>
        <Kpi label="Skipped">
          <p className={bigNum} data-testid="text-skipped-count">
            {stats?.skipped ?? 0}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-exempt-count">
            {stats?.exempt ? `${stats.exempt} exempt` : "none exempt"}
          </p>
        </Kpi>
      </div>

      <section className="surface mt-4 overflow-clip sm:mt-6">
        <SectionHeader
          className="border-b px-4 py-3.5 sm:items-center sm:px-5"
          title="Tasks"
          description={total ? `${stats?.completed ?? 0} of ${total} done` : "Nothing scheduled yet"}
          actions={
            <>
              {hasParentTasks && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setCollapseAll.mutate(true)}
                        disabled={setCollapseAll.isPending}
                        aria-label="Collapse all"
                        data-testid="button-collapse-all"
                      >
                        <ChevronsDownUp />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Collapse all</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setCollapseAll.mutate(false)}
                        disabled={setCollapseAll.isPending}
                        aria-label="Expand all"
                        data-testid="button-expand-all"
                      >
                        <ChevronsUpDown />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Expand all</TooltipContent>
                  </Tooltip>
                </>
              )}
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={resetDay.isPending}
                        aria-label="Reset day"
                        data-testid="button-reset-day"
                      >
                        <RotateCcw />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Reset day from template</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset this day?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deletes every task for this day and reloads it from the template. Custom tasks, completions, and
                      edits will be lost.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => resetDay.mutate()}>
                      Reset day
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleHideCompleted(!hideCompleted)}
                aria-pressed={hideCompleted}
                className={cn(
                  hideCompleted &&
                    "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand dark:border-brand/40 dark:bg-brand/10",
                )}
                data-testid="button-toggle-hide"
              >
                <EyeOff />
                Hide done
              </Button>
            </>
          }
        />

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
      </section>
    </div>
  );
}
