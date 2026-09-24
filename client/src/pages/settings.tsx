import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarOff,
  Download,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { PageHeader, SectionHeader, Segmented } from "@/components/app-ui";
import { ProgressBar } from "@/components/progress-bar";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { parseDateStr, todayStr } from "@/lib/dates";
import { setThemePreference, useThemePreference } from "@/lib/theme";
import type { Holiday } from "@shared/schema";

const PHASE_LABELS: Record<string, string> = {
  starting: "Starting",
  clearing: "Clearing existing data",
  deadlines: "Importing deadlines",
  templates: "Importing templates",
  dailyTasks: "Importing daily tasks",
  holidays: "Importing holidays",
  streaks: "Importing custom streaks",
  streakEntries: "Importing streak entries",
  done: "Done",
};
function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const themePref = useThemePreference();
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<unknown>(null);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    done: number;
    total: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Warn the user if they try to leave the page mid-import. The browser
  // ignores custom messages but will show its own confirmation dialog.
  useEffect(() => {
    if (!importProgress || importProgress.phase === "done") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [importProgress]);

  const { data: holidays } = useQuery<Holiday[]>({
    queryKey: ["/api/holidays"],
  });

  const addHoliday = useMutation({
    mutationFn: async (date: string) => {
      const res = await apiRequest("POST", "/api/holidays", { date });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setNewHolidayDate("");
      toast.success("Holiday added");
    },
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      toast.success("Holiday removed");
    },
  });

  const importData = useMutation({
    mutationFn: async (data: unknown) => {
      setImportProgress({ phase: "starting", done: 0, total: 1 });

      const res = await fetch("/api/import/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Import failed (${res.status})`);
      }

      // Parse Server-Sent Events incrementally. Each event is two lines:
      //   event: <name>
      //   data: <json>
      // Separated by a blank line. We accumulate bytes in `buffer`, split
      // on `\n\n`, and parse each frame.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;
      let importError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const lines = frame.split("\n");
          let event = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (event === "progress") {
            setImportProgress(payload);
          } else if (event === "done") {
            finalResult = payload;
          } else if (event === "error") {
            importError = payload?.message || "Import failed";
          }
        }
      }

      if (importError) throw new Error(importError);
      return finalResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Data imported");
      setPendingImportData(null);
      setImportDialogOpen(false);
      setImportProgress(null);
    },
    onError: (err: Error) => {
      toast.error("Import failed", { description: err.message });
      setImportProgress(null);
    },
  });

  const handleAddHoliday = () => {
    if (!newHolidayDate) return;
    addHoliday.mutate(newHolidayDate);
  };

  const handleExport = () => {
    window.open("/api/export", "_blank");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed || parsed.version !== "1") {
          toast.error("Invalid file format");
          return;
        }
        setPendingImportData(parsed);
        setImportDialogOpen(true);
      } catch {
        toast.error("Couldn't read that file");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sortedHolidays = [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const today = todayStr();
  const upcomingHolidays = sortedHolidays.filter((h) => h.date >= today);
  const pastHolidays = sortedHolidays.filter((h) => h.date < today);
  const importPct =
    importProgress && importProgress.total > 0
      ? Math.min(100, Math.round((importProgress.done / importProgress.total) * 100))
      : 0;

  const holidayRow = (h: Holiday) => (
    <li
      key={h.id}
      className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
      data-testid={`holiday-item-${h.id}`}
    >
      <CalendarOff className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm">
        {parseDateStr(h.date).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
      <Button
        size="icon-xs"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        onClick={() => deleteHoliday.mutate(h.id)}
        aria-label="Remove holiday"
        data-testid={`button-delete-holiday-${h.id}`}
      >
        <Trash2 />
      </Button>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" titleTestId="text-settings-title" description="Appearance, holidays, and your data." />

      <AlertDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          // Don't allow closing while an import is in flight.
          if (!open && importData.isPending) return;
          setImportDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
            <AlertDialogTitle>Replace all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently replaces your templates, tasks, holidays, streaks, and deadlines with the file's
              contents. It can't be undone, so export a backup first if you might want it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importProgress && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3" data-testid="import-progress">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{phaseLabel(importProgress.phase)}…</span>
                <span className="text-muted-foreground tabular-nums">
                  {importProgress.done.toLocaleString()} / {importProgress.total.toLocaleString()}
                </span>
              </div>
              <ProgressBar progress={importPct} size="sm" />
              <p className="text-xs text-muted-foreground">Keep this tab open until the import finishes.</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importData.isPending} data-testid="button-import-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                // Keep the dialog open to show progress; it closes on success.
                e.preventDefault();
                if (pendingImportData) importData.mutate(pendingImportData);
              }}
              disabled={importData.isPending}
              data-testid="button-import-confirm"
            >
              {importData.isPending && <Loader2 className="animate-spin" />}
              {importData.isPending ? "Importing…" : "Replace all data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-import-file"
      />

      <div className="space-y-4 sm:space-y-6">
        <Card className="px-5 sm:px-6 sm:py-6">
          <SectionHeader
            title="Appearance"
            description="Light, dark, or follow your device."
            actions={
              <Segmented
                label="Theme"
                value={themePref}
                onChange={setThemePreference}
                options={[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "system", label: "System", icon: Monitor },
                  { value: "dark", label: "Dark", icon: Moon },
                ]}
              />
            }
          />
        </Card>

        <Card className="px-5 sm:px-6 sm:py-6">
          <SectionHeader title="Holidays" description="Weekdays marked here use your weekend template." />
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddHoliday();
            }}
          >
            <Input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="h-9 flex-1 bg-card sm:max-w-xs dark:bg-card"
              aria-label="Holiday date"
              data-testid="input-holiday-date"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-9"
              disabled={!newHolidayDate || addHoliday.isPending}
              data-testid="button-add-holiday"
            >
              <Plus />
              Add
            </Button>
          </form>

          {sortedHolidays.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-8 text-center"
              data-testid="empty-holidays"
            >
              <p className="text-sm font-medium">No holidays set</p>
              <p className="text-xs text-muted-foreground">Pick a date above to add one.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingHolidays.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Upcoming</p>
                  <ul className="divide-y overflow-hidden rounded-xl border">{upcomingHolidays.map(holidayRow)}</ul>
                </div>
              )}
              {pastHolidays.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Past</p>
                  <ul className="divide-y overflow-hidden rounded-xl border opacity-70">{pastHolidays.map(holidayRow)}</ul>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="px-5 sm:px-6 sm:py-6">
          <SectionHeader
            title="Import & export"
            description="Back up everything (templates, tasks, holidays, streaks, deadlines) or restore from a backup."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleExport}
              className="group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors hover:bg-muted/40"
              data-testid="button-export"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Download className="size-[1.05rem]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Export data</span>
                <span className="block text-xs text-muted-foreground">Download a JSON backup</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors hover:bg-muted/40"
              data-testid="button-import"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-amber-700 dark:text-warning">
                <Upload className="size-[1.05rem]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Import data</span>
                <span className="block text-xs text-muted-foreground">Replaces everything currently stored</span>
              </span>
            </button>
          </div>
        </Card>

        <Card className="px-5 sm:px-6 sm:py-6">
          <SectionHeader
            title="Account"
            description={
              <>
                Signed in to this private workspace · <span className="font-mono">v{__APP_VERSION__}</span>
              </>
            }
            actions={
              <Button variant="outline" onClick={logout} data-testid="button-settings-logout">
                <LogOut />
                Log out
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  );
}
