import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Check, Flame, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, PageHeader } from "@/components/app-ui";
import { apiRequest } from "@/lib/queryClient";
import { computeStreakCount, offsetDateStr, parseDateStr, todayStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { playCompletionSound, triggerConfetti } from "@/lib/sounds";
import type { CustomStreak, CustomStreakEntry } from "@shared/schema";

interface StreakData {
  streak: CustomStreak;
  entries: CustomStreakEntry[];
}

const RECENT_DAYS = 14;

function StreakCard({
  data,
  onCheckIn,
  onUndo,
  onDelete,
  isCheckingIn,
  holidays,
}: {
  data: StreakData;
  onCheckIn: (id: number) => void;
  onUndo: (id: number) => void;
  onDelete: (id: number) => void;
  isCheckingIn: boolean;
  holidays?: Set<string>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [animatingFire, setAnimatingFire] = useState(false);
  const { streak, entries } = data;
  const today = todayStr();
  const checkedInToday = entries.some((e) => e.date === today);
  const streakCount = useMemo(
    () => computeStreakCount(entries, streak.skipWeekends, holidays),
    [entries, streak.skipWeekends, holidays],
  );
  const entryDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
  const recent = useMemo(
    () => Array.from({ length: RECENT_DAYS }, (_, i) => offsetDateStr(i - (RECENT_DAYS - 1))),
    [],
  );

  const handleClick = () => {
    if (isCheckingIn) return;
    if (checkedInToday) {
      onUndo(streak.id);
    } else {
      setAnimatingFire(true);
      onCheckIn(streak.id);
      setTimeout(() => setAnimatingFire(false), 600);
    }
  };

  return (
    <div className="surface flex flex-col gap-4 p-4 sm:p-5" data-testid={`streak-card-${streak.id}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl leading-none"
        >
          {streak.emoji}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-medium" data-testid={`text-streak-name-${streak.id}`}>
            {streak.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {streak.skipWeekends ? "Weekdays · holidays off" : "Every day"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-1 text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${streak.name}`}
          data-testid={`button-delete-streak-${streak.id}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <Flame
            className={cn(
              "size-5 self-center",
              streakCount > 0 ? "text-chart-2" : "text-muted-foreground/40",
              animatingFire && "animate-bounce",
            )}
          />
          <span className="num text-3xl leading-none font-semibold" data-testid={`text-streak-count-${streak.id}`}>
            {streakCount}
          </span>
          <span className="text-xs text-muted-foreground">day{streakCount === 1 ? "" : "s"}</span>
        </div>
        <Button
          variant="outline"
          onClick={handleClick}
          disabled={isCheckingIn}
          aria-pressed={checkedInToday}
          className={cn(
            checkedInToday &&
              "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand dark:border-brand/40 dark:bg-brand/10",
          )}
          data-testid={`button-checkin-${streak.id}`}
        >
          <Check />
          {checkedInToday ? "Done today" : "Check in"}
        </Button>
      </div>

      <div>
        <div className="flex gap-1" aria-label={`Last ${RECENT_DAYS} days`}>
          {recent.map((date) => {
            const d = parseDateStr(date);
            const off = streak.skipWeekends && (d.getDay() === 0 || d.getDay() === 6 || !!holidays?.has(date));
            const done = entryDates.has(date);
            return (
              <span
                key={date}
                title={`${date}: ${done ? "done" : off ? "off day" : "missed"}`}
                className={cn(
                  "h-2 flex-1 rounded-full",
                  done ? "bg-positive" : off ? "bg-muted/60" : "bg-muted",
                  date === today && !done && "ring-1 ring-foreground/30 ring-inset",
                )}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[0.6875rem] text-muted-foreground">
          <span>{RECENT_DAYS - 1} days ago</span>
          <span>Today</span>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{streak.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the streak and all of its history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(streak.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CustomStreaksPage() {
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newSkipWeekends, setNewSkipWeekends] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: streakData, isLoading } = useQuery<StreakData[]>({
    queryKey: ["/api/custom-streaks"],
  });

  const { data: holidayList } = useQuery<{ id: number; userId: number; date: string }[]>({
    queryKey: ["/api/holidays"],
  });

  const holidaySet = useMemo(() => new Set(holidayList?.map((h) => h.date)), [holidayList]);

  const createStreak = useMutation({
    mutationFn: async ({ name, emoji, skipWeekends }: { name: string; emoji: string; skipWeekends: boolean }) => {
      const res = await apiRequest("POST", "/api/custom-streaks", { name, emoji, skipWeekends });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-streaks"] });
      setNewName("");
      setNewEmoji("");
      setNewSkipWeekends(false);
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to create streak", { description: error.message });
    },
  });

  const deleteStreak = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/custom-streaks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-streaks"] });
    },
  });

  const checkIn = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/custom-streaks/${id}/check-in`, { date: todayStr() });
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/custom-streaks"] });
      const previous = queryClient.getQueryData<StreakData[]>(["/api/custom-streaks"]);
      if (previous) {
        const today = todayStr();
        queryClient.setQueryData(
          ["/api/custom-streaks"],
          previous.map((sd) =>
            sd.streak.id === id ? { ...sd, entries: [{ id: -1, streakId: id, date: today }, ...sd.entries] } : sd,
          ),
        );
      }
      playCompletionSound();
      triggerConfetti();
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["/api/custom-streaks"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-streaks"] });
    },
  });

  const undoCheckIn = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/custom-streaks/${id}/check-in`, { date: todayStr() });
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/custom-streaks"] });
      const previous = queryClient.getQueryData<StreakData[]>(["/api/custom-streaks"]);
      if (previous) {
        const today = todayStr();
        queryClient.setQueryData(
          ["/api/custom-streaks"],
          previous.map((sd) =>
            sd.streak.id === id ? { ...sd, entries: sd.entries.filter((e) => e.date !== today) } : sd,
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["/api/custom-streaks"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-streaks"] });
    },
  });

  const canCreate = newName.trim() !== "" && newEmoji.trim() !== "" && !createStreak.isPending;
  const handleCreate = () => {
    if (!canCreate) return;
    createStreak.mutate({ name: newName.trim(), emoji: newEmoji.trim(), skipWeekends: newSkipWeekends });
  };

  const addButton = (
    <Button onClick={() => setDialogOpen(true)} data-testid="button-add-streak">
      <Plus />
      New streak
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Streaks"
        titleTestId="text-custom-streaks-title"
        description="Habits you check off once a day, with a running count."
        actions={addButton}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3" aria-busy aria-label="Loading">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : !streakData || streakData.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Zap}
            title="No streaks yet"
            description="Add a habit like “Exercise” or “Read” and check in each day to keep it going."
            action={
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus />
                New streak
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3" data-testid="streak-grid">
          {streakData.map((sd) => (
            <StreakCard
              key={sd.streak.id}
              data={sd}
              onCheckIn={(id) => checkIn.mutate(id)}
              onUndo={(id) => undoCheckIn.mutate(id)}
              onDelete={(id) => deleteStreak.mutate(id)}
              isCheckingIn={checkIn.isPending}
              holidays={holidaySet}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New streak</DialogTitle>
            <DialogDescription>Pick an emoji and a name. You can check in once per day.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <div className="grid grid-cols-[4.5rem_1fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="streak-emoji">Emoji</Label>
                <Input
                  id="streak-emoji"
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  placeholder="💪"
                  className="h-9 text-center text-lg"
                  maxLength={4}
                  data-testid="input-streak-emoji"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="streak-name">Name</Label>
                <Input
                  id="streak-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Exercise"
                  className="h-9"
                  data-testid="input-streak-name"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-3 py-2.5">
              <Label htmlFor="skip-weekends" className="cursor-pointer text-sm font-normal text-foreground">
                Weekends and holidays don't break it
              </Label>
              <Switch
                id="skip-weekends"
                checked={newSkipWeekends}
                onCheckedChange={setNewSkipWeekends}
                data-testid="switch-skip-weekends"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canCreate} data-testid="button-create-streak">
                Create streak
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
