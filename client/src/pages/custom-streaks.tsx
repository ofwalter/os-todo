import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Trash2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  playCompletionSound,
  triggerConfetti,
} from "@/lib/sounds";
import type { CustomStreak, CustomStreakEntry } from "@shared/schema";

interface StreakData {
  streak: CustomStreak;
  entries: CustomStreakEntry[];
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekendDay(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function computeStreakCount(entries: CustomStreakEntry[], skipWeekends: boolean, holidays?: Set<string>): number {
  if (entries.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getTodayStr();

  const dateSet = new Set(entries.map((e) => e.date));

  let count = 0;
  const d = new Date(today);

  if (!dateSet.has(todayStr)) {
    const isSkippable = skipWeekends && (isWeekendDay(d) || holidays?.has(todayStr));
    if (!isSkippable) {
      d.setDate(d.getDate() - 1);
    }
  } else {
    count++;
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const dateStr = formatDateStr(d);
    const isSkippable = skipWeekends && (isWeekendDay(d) || holidays?.has(dateStr));
    if (dateSet.has(dateStr)) {
      count++;
      d.setDate(d.getDate() - 1);
    } else if (isSkippable) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return count;
}

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const todayStr = getTodayStr();
  const checkedInToday = data.entries.some((e) => e.date === todayStr);
  const streakCount = useMemo(
    () => computeStreakCount(data.entries, data.streak.skipWeekends, holidays),
    [data.entries, data.streak.skipWeekends, holidays],
  );
  const [animatingFire, setAnimatingFire] = useState(false);

  const handleClick = () => {
    if (isCheckingIn) return;
    if (checkedInToday) {
      onUndo(data.streak.id);
    } else {
      setAnimatingFire(true);
      onCheckIn(data.streak.id);
      setTimeout(() => setAnimatingFire(false), 600);
    }
  };

  return (
    <div
      className="flex flex-col items-center"
      data-testid={`streak-card-${data.streak.id}`}
    >
      <div className="relative group mb-1">
        <button
          onClick={handleClick}
          disabled={isCheckingIn}
          className={cn(
            "w-16 h-16 rounded-xl flex flex-col items-center justify-center transition-all duration-200 border-2",
            checkedInToday
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 shadow-sm"
              : "bg-card border-border hover:border-primary/40 hover:shadow-md active:scale-95",
          )}
          data-testid={`button-checkin-${data.streak.id}`}
        >
          <span className="text-2xl leading-none">{data.streak.emoji}</span>
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-delete-streak-${data.streak.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <span
        className="text-[10px] text-muted-foreground text-center leading-tight max-w-[72px] truncate"
        data-testid={`text-streak-name-${data.streak.id}`}
      >
        {data.streak.name}
      </span>

      {streakCount > 0 && (
        <div className="flex items-center gap-0.5 mt-1 flex-wrap justify-center max-w-[80px]">
          {Array.from({ length: Math.min(streakCount, 30) }).map((_, i) => (
            <Flame
              key={i}
              className={cn(
                "w-3 h-3 text-orange-500",
                i === 0 && animatingFire && "animate-bounce",
              )}
              style={{
                animationDelay: i === 0 && animatingFire ? "0ms" : undefined,
                animationDuration: i === 0 && animatingFire ? "500ms" : undefined,
              }}
            />
          ))}
          {streakCount > 30 && (
            <span className="text-[9px] text-orange-500 font-bold">+{streakCount - 30}</span>
          )}
        </div>
      )}

      {showDeleteConfirm && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete "{data.streak.name}"?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently delete this streak and all its history.
            </p>
            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onDelete(data.streak.id);
                  setShowDeleteConfirm(false);
                }}
                data-testid="button-confirm-delete"
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function CustomStreaksPage() {
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newSkipWeekends, setNewSkipWeekends] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: streakData, isLoading } = useQuery<StreakData[]>({
    queryKey: ["/api/custom-streaks"],
  });

  const { data: holidayList } = useQuery<{ id: number; userId: number; date: string }[]>({
    queryKey: ["/api/holidays"],
  });

  const holidaySet = useMemo(() => {
    if (!holidayList) return new Set<string>();
    return new Set(holidayList.map((h) => h.date));
  }, [holidayList]);

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
    onError: (error: any) => {
      toast({
        title: "Failed to create streak",
        description: error.message,
        variant: "destructive",
      });
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
      const res = await apiRequest("POST", `/api/custom-streaks/${id}/check-in`, { date: getTodayStr() });
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/custom-streaks"] });
      const previous = queryClient.getQueryData<StreakData[]>(["/api/custom-streaks"]);
      if (previous) {
        const todayStr = getTodayStr();
        const updated = previous.map((sd) => {
          if (sd.streak.id === id) {
            return {
              ...sd,
              entries: [{ id: -1, streakId: id, date: todayStr }, ...sd.entries],
            };
          }
          return sd;
        });
        queryClient.setQueryData(["/api/custom-streaks"], updated);
      }
      playCompletionSound();
      triggerConfetti();
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/custom-streaks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-streaks"] });
    },
  });

  const undoCheckIn = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/custom-streaks/${id}/check-in`, { date: getTodayStr() });
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/custom-streaks"] });
      const previous = queryClient.getQueryData<StreakData[]>(["/api/custom-streaks"]);
      if (previous) {
        const todayStr = getTodayStr();
        const updated = previous.map((sd) => {
          if (sd.streak.id === id) {
            return {
              ...sd,
              entries: sd.entries.filter((e) => e.date !== todayStr),
            };
          }
          return sd;
        });
        queryClient.setQueryData(["/api/custom-streaks"], updated);
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/custom-streaks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-streaks"] });
    },
  });

  const handleCreate = () => {
    if (!newName.trim() || !newEmoji.trim()) return;
    createStreak.mutate({ name: newName.trim(), emoji: newEmoji.trim(), skipWeekends: newSkipWeekends });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-16 h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-lg font-semibold tracking-tight"
            data-testid="text-custom-streaks-title"
          >
            Custom Streaks
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track daily habits with a single tap
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-streak">
              <Plus className="w-4 h-4 mr-1" />
              Add Streak
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>New Custom Streak</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Emoji
                </label>
                <Input
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  placeholder="e.g. 💪"
                  className="text-xl"
                  maxLength={4}
                  data-testid="input-streak-emoji"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Name
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Exercise"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  data-testid="input-streak-name"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="skip-weekends" className="text-xs font-medium text-muted-foreground cursor-pointer">
                  Weekends/holidays don't break streak
                </Label>
                <Switch
                  id="skip-weekends"
                  checked={newSkipWeekends}
                  onCheckedChange={setNewSkipWeekends}
                  data-testid="switch-skip-weekends"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || !newEmoji.trim() || createStreak.isPending}
                className="w-full"
                data-testid="button-create-streak"
              >
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!streakData || streakData.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <Flame className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No custom streaks yet</p>
          <p className="text-xs mt-1">Add one to start tracking daily habits</p>
        </div>
      ) : (
        <div
          className="flex flex-wrap gap-4"
          data-testid="streak-grid"
        >
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
    </div>
  );
}
