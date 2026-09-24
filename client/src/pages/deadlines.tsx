import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck2, CalendarClock, ChevronDown, FolderTree, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, StatusChip } from "@/components/app-ui";
import { apiRequest } from "@/lib/queryClient";
import { daysFromToday, parseDateStr, todayStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Deadline } from "@shared/schema";

// 30 and 365 are special-cased on the server as "same day next month/year".
const REPEAT_PRESETS: { value: string; label: string; days: number | null }[] = [
  { value: "none", label: "One-off", days: null },
  { value: "1", label: "Daily", days: 1 },
  { value: "7", label: "Weekly", days: 7 },
  { value: "14", label: "Every 2 weeks", days: 14 },
  { value: "30", label: "Monthly", days: 30 },
  { value: "365", label: "Yearly", days: 365 },
  { value: "custom", label: "Every N days…", days: null },
];

function repeatLabel(days: number | null): string | null {
  if (!days) return null;
  const preset = REPEAT_PRESETS.find((p) => p.days === days);
  return preset ? preset.label : `Every ${days} days`;
}

function dueLabel(dueDate: string): string {
  const diff = daysFromToday(dueDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days overdue`;
  if (diff < 7) return `In ${diff} days`;
  return parseDateStr(dueDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diff > 300 ? "numeric" : undefined,
  });
}

interface FormState {
  name: string;
  dueDate: string;
  repeat: string;
  customDays: string;
  bucket: string;
}

function toForm(d?: Deadline): FormState {
  if (!d) {
    return { name: "", dueDate: todayStr(), repeat: "none", customDays: "", bucket: "" };
  }
  const preset = REPEAT_PRESETS.find((p) => p.days !== null && p.days === d.repeatDays);
  return {
    name: d.name,
    dueDate: d.dueDate,
    repeat: preset ? preset.value : d.repeatDays ? "custom" : "none",
    customDays: d.repeatDays && !preset ? String(d.repeatDays) : "",
    bucket: d.bucket ?? "",
  };
}

function formRepeatDays(form: FormState): number | null {
  if (form.repeat === "custom") {
    const n = parseInt(form.customDays, 10);
    return n > 0 ? n : null;
  }
  return REPEAT_PRESETS.find((p) => p.value === form.repeat)?.days ?? null;
}

function DeadlineRow({
  deadline,
  today,
  onEdit,
  onDelete,
}: {
  deadline: Deadline;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const overdue = !deadline.isDone && deadline.dueDate < today;
  const dueToday = !deadline.isDone && deadline.dueDate === today;
  const repeat = repeatLabel(deadline.repeatDays);
  const Icon = deadline.isDone ? CalendarCheck2 : repeat ? Repeat : CalendarClock;

  return (
    <li
      className={cn(
        "group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-muted/40 md:px-5",
        deadline.isDone && "opacity-55",
      )}
      data-testid={`deadline-row-${deadline.id}`}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-xl [&_svg]:size-[1.05rem]",
          overdue ? "bg-negative/12 text-negative" : deadline.isDone ? "bg-muted text-muted-foreground" : "bg-brand/10 text-brand",
        )}
      >
        <Icon />
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className={cn("truncate text-sm font-medium", deadline.isDone && "line-through")}>{deadline.name}</p>
          {dueToday && <StatusChip tone="brand">Today</StatusChip>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {repeat ? (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3" />
              {repeat}
            </span>
          ) : (
            <span>One-off</span>
          )}
          {deadline.bucket && (
            <span className="inline-flex items-center gap-1">
              <FolderTree className="size-3" />
              {deadline.bucket}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="mr-1 text-right">
          <p
            className={cn(
              "text-xs font-medium whitespace-nowrap tabular-nums",
              overdue ? "text-negative" : "text-foreground",
            )}
          >
            {deadline.isDone ? "Done" : dueLabel(deadline.dueDate)}
          </p>
          {!deadline.isDone && daysFromToday(deadline.dueDate) >= 7 && (
            <p className="text-[0.6875rem] text-muted-foreground">
              {parseDateStr(deadline.dueDate).toLocaleDateString("en-US", { weekday: "short" })}
            </p>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          onClick={onEdit}
          aria-label={`Edit ${deadline.name}`}
          data-testid={`button-edit-deadline-${deadline.id}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          onClick={onDelete}
          aria-label={`Delete ${deadline.name}`}
          data-testid={`button-delete-deadline-${deadline.id}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function GroupHeader({ title, count, tone }: { title: string; count: number; tone?: "negative" }) {
  return (
    <div className="sticky top-14 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-2 backdrop-blur md:px-5 lg:top-0">
      <span className={cn("text-xs font-semibold", tone === "negative" ? "text-negative" : "text-foreground")}>
        {title}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

export default function DeadlinesPage() {
  const queryClient = useQueryClient();
  const today = todayStr();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [form, setForm] = useState<FormState>(toForm());
  const [showDone, setShowDone] = useState(false);

  const { data: deadlines, isLoading } = useQuery<Deadline[]>({
    queryKey: ["/api/deadlines"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
    // Day task lists pick up deadline changes on their next fetch.
    queryClient.invalidateQueries({ queryKey: ["/api/days"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        dueDate: form.dueDate,
        repeatDays: formRepeatDays(form),
        bucket: form.bucket || null,
        // Re-saving a finished one-off with a new date brings it back.
        ...(editing?.isDone && form.dueDate !== editing.dueDate ? { isDone: false } : {}),
      };
      const res = editing
        ? await apiRequest("PATCH", `/api/deadlines/${editing.id}`, body)
        : await apiRequest("POST", "/api/deadlines", body);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success(editing ? "Deadline updated" : "Deadline added");
    },
    onError: (err: Error) => {
      toast.error("Failed to save deadline", { description: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/deadlines/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Deadline deleted");
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm(toForm());
    setDialogOpen(true);
  };

  const openEdit = (d: Deadline) => {
    setEditing(d);
    setForm(toForm(d));
    setDialogOpen(true);
  };

  const byDue = (a: Deadline, b: Deadline) => a.dueDate.localeCompare(b.dueDate);
  const active = (deadlines ?? []).filter((d) => !d.isDone).sort(byDue);
  const overdue = active.filter((d) => d.dueDate < today);
  const thisWeek = active.filter((d) => d.dueDate >= today && daysFromToday(d.dueDate) < 7);
  const later = active.filter((d) => daysFromToday(d.dueDate) >= 7);
  const done = (deadlines ?? []).filter((d) => d.isDone).sort(byDue);

  const canSave =
    form.name.trim() !== "" && form.dueDate !== "" && (form.repeat !== "custom" || formRepeatDays(form) !== null);

  const renderRows = (list: Deadline[]) => (
    <ul className="divide-y">
      {list.map((d) => (
        <DeadlineRow key={d.id} deadline={d} today={today} onEdit={() => openEdit(d)} onDelete={() => remove.mutate(d.id)} />
      ))}
    </ul>
  );

  const stat = (label: string, value: number, tone?: string) => (
    <div className="surface px-3 py-2.5 sm:px-4">
      <p className="text-[0.6875rem] font-medium text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 truncate text-sm font-semibold sm:text-base", tone)}>{value}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Deadlines"
        titleTestId="text-deadlines-title"
        description="Chores and due dates. Each one appears as a task on the day it's due."
        actions={
          <Button onClick={openNew} data-testid="button-add-deadline">
            <Plus />
            New deadline
          </Button>
        }
      />

      {isLoading ? (
        <div aria-busy aria-label="Loading">
          <div className="mb-4 grid grid-cols-3 gap-3 sm:mb-6">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 sm:mb-6 sm:gap-4">
            {stat("Overdue", overdue.length, overdue.length ? "text-negative" : undefined)}
            {stat("Next 7 days", thisWeek.length)}
            {stat("Recurring", active.filter((d) => d.repeatDays).length)}
          </div>

          <div className="surface overflow-clip">
            {active.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                testId="empty-deadlines"
                title="No upcoming deadlines"
                description="Add bills, chores, or anything with a due date. It shows up on your list that day."
                action={
                  <Button variant="outline" size="sm" onClick={openNew}>
                    <Plus />
                    New deadline
                  </Button>
                }
              />
            ) : (
              <>
                {overdue.length > 0 && (
                  <section>
                    <GroupHeader title="Overdue: missed on their due day" count={overdue.length} tone="negative" />
                    {renderRows(overdue)}
                  </section>
                )}
                {thisWeek.length > 0 && (
                  <section className={cn(overdue.length > 0 && "border-t")}>
                    <GroupHeader title="Next 7 days" count={thisWeek.length} />
                    {renderRows(thisWeek)}
                  </section>
                )}
                {later.length > 0 && (
                  <section className={cn((overdue.length > 0 || thisWeek.length > 0) && "border-t")}>
                    <GroupHeader title="Later" count={later.length} />
                    {renderRows(later)}
                  </section>
                )}
              </>
            )}
          </div>

          {done.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                data-testid="button-toggle-done"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", !showDone && "-rotate-90")} />
                Completed one-offs ({done.length})
              </button>
              {showDone && <div className="surface mt-3 overflow-clip">{renderRows(done)}</div>}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit deadline" : "New deadline"}</DialogTitle>
            <DialogDescription>It'll appear as a task on the day it's due.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="deadline-name">Name</Label>
              <Input
                id="deadline-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Pay rent"
                className="h-9"
                data-testid="input-deadline-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="deadline-date">{editing ? "Next due" : "First due"}</Label>
                <Input
                  id="deadline-date"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="h-9"
                  data-testid="input-deadline-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Repeat</Label>
                <Select value={form.repeat} onValueChange={(v) => setForm({ ...form, repeat: v })}>
                  <SelectTrigger className="h-9" data-testid="select-deadline-repeat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEAT_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.repeat === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="deadline-custom-days">Repeat every</Label>
                <div className="relative">
                  <Input
                    id="deadline-custom-days"
                    type="number"
                    min={1}
                    value={form.customDays}
                    onChange={(e) => setForm({ ...form, customDays: e.target.value })}
                    placeholder="10"
                    className="h-9 pr-12 tabular-nums"
                    data-testid="input-deadline-custom-days"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                    days
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="deadline-bucket">Group under (optional)</Label>
              <Input
                id="deadline-bucket"
                value={form.bucket}
                onChange={(e) => setForm({ ...form, bucket: e.target.value })}
                placeholder="Home"
                className="h-9"
                data-testid="input-deadline-bucket"
              />
              <p className="text-xs text-muted-foreground">
                Nests it under that day's task with this exact title, if there is one.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || save.isPending} data-testid="button-save-deadline">
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
