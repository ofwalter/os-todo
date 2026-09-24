import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Repeat, FolderTree, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function repeatLabel(days: number | null): string | null {
  if (!days) return null;
  const preset = REPEAT_PRESETS.find((p) => p.days === days);
  return preset ? preset.label : `Every ${days} days`;
}

function dueLabel(dueDate: string, today: string): string {
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days overdue`;
  if (diff < 7) return `In ${diff} days`;
  return new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
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
    return { name: "", dueDate: getTodayStr(), repeat: "none", customDays: "", bucket: "" };
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
  const repeat = repeatLabel(deadline.repeatDays);

  return (
    <div
      className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-accent/50 group"
      data-testid={`deadline-row-${deadline.id}`}
    >
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", deadline.isDone && "line-through text-muted-foreground")}>
          {deadline.name}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className={cn(overdue && "text-destructive font-medium")}>
            {deadline.isDone ? "Done" : dueLabel(deadline.dueDate, today)}
          </span>
          {repeat && (
            <span className="flex items-center gap-1">
              <Repeat className="w-3 h-3" />
              {repeat}
            </span>
          )}
          {deadline.bucket && (
            <span className="flex items-center gap-1">
              <FolderTree className="w-3 h-3" />
              {deadline.bucket}
            </span>
          )}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100"
        onClick={onEdit}
        aria-label="Edit"
        data-testid={`button-edit-deadline-${deadline.id}`}
      >
        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100"
        onClick={onDelete}
        aria-label="Delete"
        data-testid={`button-delete-deadline-${deadline.id}`}
      >
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    </div>
  );
}

export default function DeadlinesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = getTodayStr();

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
      toast({ title: editing ? "Deadline updated" : "Deadline added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save deadline", description: err.message, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/deadlines/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Deadline deleted" });
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

  const active = (deadlines ?? []).filter((d) => !d.isDone);
  const overdue = active.filter((d) => d.dueDate < today);
  const upcoming = active.filter((d) => d.dueDate >= today);
  const done = (deadlines ?? []).filter((d) => d.isDone);

  const canSave =
    form.name.trim() !== "" &&
    form.dueDate !== "" &&
    (form.repeat !== "custom" || formRepeatDays(form) !== null);

  const renderRows = (list: Deadline[]) =>
    list.map((d) => (
      <DeadlineRow
        key={d.id}
        deadline={d}
        today={today}
        onEdit={() => openEdit(d)}
        onDelete={() => remove.mutate(d.id)}
      />
    ));

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-deadlines-title">
            Deadlines & Chores
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each one shows up as a task on the day it's due
          </p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-add-deadline">
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <Card className="p-3 border-destructive/40">
              <h2 className="text-xs font-medium text-destructive px-2 mb-1">
                Overdue: missed on their due day
              </h2>
              {renderRows(overdue)}
            </Card>
          )}

          <Card className="p-3">
            <h2 className="text-xs font-medium text-muted-foreground px-2 mb-1">Upcoming</h2>
            {upcoming.length > 0 ? (
              renderRows(upcoming)
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="empty-deadlines">
                <CalendarClock className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
              </div>
            )}
          </Card>

          {done.length > 0 && (
            <div>
              <button
                className="text-xs text-muted-foreground hover:text-foreground px-2"
                onClick={() => setShowDone((v) => !v)}
                data-testid="button-toggle-done"
              >
                {showDone ? "Hide" : "Show"} completed one-offs ({done.length})
              </button>
              {showDone && <Card className="p-3 mt-2">{renderRows(done)}</Card>}
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit deadline" : "New deadline"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="deadline-name" className="text-xs">Name</Label>
              <Input
                id="deadline-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Pay rent"
                data-testid="input-deadline-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline-date" className="text-xs">
                {editing ? "Next due" : "First due"}
              </Label>
              <Input
                id="deadline-date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                data-testid="input-deadline-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Repeat</Label>
              <div className="flex gap-2">
                <Select value={form.repeat} onValueChange={(v) => setForm({ ...form, repeat: v })}>
                  <SelectTrigger className="flex-1" data-testid="select-deadline-repeat">
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
                {form.repeat === "custom" && (
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={form.customDays}
                    onChange={(e) => setForm({ ...form, customDays: e.target.value })}
                    placeholder="Days"
                    data-testid="input-deadline-custom-days"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline-bucket" className="text-xs">Group under (optional)</Label>
              <Input
                id="deadline-bucket"
                value={form.bucket}
                onChange={(e) => setForm({ ...form, bucket: e.target.value })}
                placeholder="e.g. Home"
                data-testid="input-deadline-bucket"
              />
              <p className="text-[11px] text-muted-foreground">
                Nests it under that day's task with this exact title, if there is one.
              </p>
            </div>
            <DialogFooter>
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
