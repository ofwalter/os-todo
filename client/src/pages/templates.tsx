import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Segmented, StatusChip } from "@/components/app-ui";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { TaskTemplate, TemplateType } from "@shared/schema";

interface TemplateNode {
  template: TaskTemplate;
  children: TemplateNode[];
}

function buildTree(templates: TaskTemplate[]): TemplateNode[] {
  const map = new Map<number, TemplateNode>();
  const roots: TemplateNode[] = [];

  for (const t of templates) {
    map.set(t.id, { template: t, children: [] });
  }

  for (const t of templates) {
    const node = map.get(t.id)!;
    if (t.parentId && map.has(t.parentId)) {
      map.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TemplateNode[]) => {
    nodes.sort((a, b) => a.template.position - b.template.position);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);
  return roots;
}

function treeToText(nodes: TemplateNode[], indent = 0): string {
  let result = "";
  for (const node of nodes) {
    result += "  ".repeat(indent) + node.template.title + "\n";
    if (node.children.length > 0) {
      result += treeToText(node.children, indent + 1);
    }
  }
  return result;
}

function parseText(text: string): { title: string; depth: number }[] {
  const lines: { title: string; depth: number }[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const match = raw.match(/^(\s*)/);
    const leadingSpaces = match ? match[1].length : 0;
    const depth = Math.floor(leadingSpaces / 2);
    lines.push({ title: raw.trim(), depth });
  }
  return lines;
}

function TemplateEditor({ templateType }: { templateType: TemplateType }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: templates, isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/templates", templateType],
  });

  useEffect(() => {
    if (templates !== undefined) {
      const tree = buildTree(templates);
      const generated = treeToText(tree);
      setText(generated);
      setSavedText(generated);
    }
  }, [templates, templateType]);

  const syncMutation = useMutation({
    mutationFn: async (lines: { title: string; depth: number }[]) => {
      const res = await apiRequest("PUT", `/api/templates/${templateType}/sync`, { lines });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateType] });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      toast.success("Template saved");
    },
    onError: () => {
      toast.error("Failed to save template");
    },
  });

  const handleSave = useCallback(() => {
    const lines = parseText(text);
    syncMutation.mutate(lines);
  }, [text, syncMutation]);

  const handleReset = useCallback(() => {
    setText(savedText);
  }, [savedText]);

  const hasChanges = text !== savedText;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (hasChanges) handleSave();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = value.indexOf("\n", end);
        const actualEnd = lineEnd === -1 ? value.length : lineEnd;

        const selectedLines = value.substring(lineStart, actualEnd);
        const lines = selectedLines.split("\n");

        const modified = lines.map((line) => {
          if (e.shiftKey) {
            return line.startsWith("  ") ? line.substring(2) : line;
          }
          return "  " + line;
        });

        const newText = value.substring(0, lineStart) + modified.join("\n") + value.substring(actualEnd);
        setText(newText);

        requestAnimationFrame(() => {
          const diff = e.shiftKey ? -2 : 2;
          textarea.selectionStart = Math.max(lineStart, start + diff);
          textarea.selectionEnd = Math.max(lineStart, end + diff * lines.length);
        });
      }
    },
    [hasChanges, handleSave],
  );

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.max(320, textarea.scrollHeight) + "px";
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  const lineCount = text.split("\n").filter((l) => l.trim()).length;

  if (isLoading) {
    return <Skeleton className="h-96 rounded-2xl" aria-busy aria-label="Loading" />;
  }

  return (
    <div className="surface overflow-clip">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">
            {templateType === "weekday" ? "Weekday routine" : "Weekend routine"}
          </h2>
          {hasChanges && <StatusChip tone="warning">Unsaved</StatusChip>}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-template-count">
          {lineCount} {lineCount === 1 ? "task" : "tasks"}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "block w-full resize-none bg-transparent px-4 py-4 font-mono text-[0.8125rem] leading-7 outline-none sm:px-5",
          "placeholder:text-muted-foreground/50 focus-visible:bg-muted/20",
        )}
        placeholder={"Morning\n  Brush teeth\n  Exercise\nEvening\n  Read"}
        spellCheck={false}
        aria-label={`${templateType} template`}
        data-testid="textarea-template"
      />

      <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-muted-foreground" data-testid="text-template-hint">
          Indent 2 spaces for subtasks ·{" "}
          <kbd className="font-mono">Tab</kbd>/<kbd className="font-mono">Shift+Tab</kbd> to indent ·{" "}
          <kbd className="font-mono">Ctrl+S</kbd> to save
        </p>
        <div className="flex items-center justify-end gap-2">
          {hasChanges && (
            <Button variant="ghost" onClick={handleReset} data-testid="button-reset-template">
              <RotateCcw />
              Discard
            </Button>
          )}
          <Button onClick={handleSave} disabled={!hasChanges || syncMutation.isPending} data-testid="button-save-template">
            {justSaved ? <Check /> : <Save />}
            {justSaved ? "Saved" : syncMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [type, setType] = useState<TemplateType>("weekday");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Templates"
        titleTestId="text-templates-title"
        description="Your routine as plain text. New days start from the matching template."
        actions={
          <Segmented
            label="Template"
            value={type}
            onChange={setType}
            options={[
              { value: "weekday", label: "Weekday", testId: "tab-weekday" },
              { value: "weekend", label: "Weekend", testId: "tab-weekend" },
            ]}
          />
        }
      />
      <TemplateEditor key={type} templateType={type} />
      <p className="mt-3 text-xs text-muted-foreground">
        Holidays you mark in Settings use the weekend template.
      </p>
    </div>
  );
}
