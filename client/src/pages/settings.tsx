import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Trash2,
  Plus,
  CalendarClock,
  Download,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
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
      toast({ title: "Holiday added" });
    },
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      toast({ title: "Holiday removed" });
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
      toast({ title: "Data imported successfully" });
      setPendingImportData(null);
      setImportDialogOpen(false);
      setImportProgress(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Import failed",
        description: err.message,
        variant: "destructive",
      });
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
          toast({ title: "Invalid file format", variant: "destructive" });
          return;
        }
        setPendingImportData(parsed);
        setImportDialogOpen(true);
      } catch {
        toast({ title: "Failed to parse file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold tracking-tight mb-1" data-testid="text-settings-title">
        Settings
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configure your daily routine app
      </p>

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
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Replace all data?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently replace all your current templates, tasks,
              holidays, custom streaks, and deadlines with the data from the file. This
              cannot be undone. Export your current data first if you want a
              backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importProgress && (
            <div className="my-2 space-y-2" data-testid="import-progress">
              <div className="text-sm text-muted-foreground">
                {phaseLabel(importProgress.phase)} — {importProgress.done} /{" "}
                {importProgress.total}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{
                    width: `${
                      importProgress.total > 0
                        ? Math.min(
                            100,
                            (importProgress.done / importProgress.total) * 100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Don't close this tab until the import finishes.
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={importData.isPending}
              data-testid="button-import-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingImportData && importData.mutate(pendingImportData)}
              disabled={importData.isPending}
              data-testid="button-import-confirm"
            >
              {importData.isPending ? "Importing…" : "Yes, replace all data"}
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

      <div className="space-y-6">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium">Holidays</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Mark weekdays as holidays to use your weekend template instead.
          </p>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="flex-1 text-sm"
              data-testid="input-holiday-date"
            />
            <Button
              size="sm"
              onClick={handleAddHoliday}
              disabled={!newHolidayDate}
              data-testid="button-add-holiday"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {holidays && holidays.length > 0 && (
            <div className="space-y-1 mt-2">
              {holidays
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50 group"
                    data-testid={`holiday-item-${h.id}`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="flex-1 text-sm">
                      {new Date(h.date + "T00:00:00").toLocaleDateString(
                        "en-US",
                        {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteHoliday.mutate(h.id)}
                      data-testid={`button-delete-holiday-${h.id}`}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {(!holidays || holidays.length === 0) && (
            <p className="text-xs text-muted-foreground py-2" data-testid="empty-holidays">
              No holidays set
            </p>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium">Import & Export</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Back up your data or move it to another database. The export
            includes all templates, tasks, holidays, custom streaks, and
            deadlines.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              data-testid="button-export"
              className="flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export data
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-import"
              className="flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import data
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Importing will replace all existing data.
          </p>
        </Card>
      </div>
    </div>
  );
}
