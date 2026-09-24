import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
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
      toast({ title: "Template saved" });
    },
    onError: () => {
      toast({ title: "Failed to save template", variant: "destructive" });
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
      textarea.style.height = Math.max(200, textarea.scrollHeight) + "px";
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  const lineCount = text.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full font-mono text-sm leading-relaxed p-4 rounded-lg border resize-none",
            "bg-muted/30 dark:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-ring",
            "placeholder:text-muted-foreground/50",
            hasChanges && "border-amber-500/50 dark:border-amber-400/30",
          )}
          placeholder={"Morning\n  Brush teeth\n  Exercise\nEvening\n  Read"}
          spellCheck={false}
          data-testid="textarea-template"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground" data-testid="text-template-hint">
          {lineCount} {lineCount === 1 ? "task" : "tasks"} &middot; Use 2-space indent for subtasks &middot; Tab/Shift+Tab to indent &middot; Ctrl+S to save
        </p>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReset}
              data-testid="button-reset-template"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || syncMutation.isPending}
            data-testid="button-save-template"
          >
            {justSaved ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold tracking-tight mb-1" data-testid="text-templates-title">
        Templates
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Edit your daily routine as text. Indent with 2 spaces to create subtasks.
      </p>

      <Tabs defaultValue="weekday">
        <TabsList className="mb-4" data-testid="template-tabs">
          <TabsTrigger value="weekday" data-testid="tab-weekday">
            Weekday
          </TabsTrigger>
          <TabsTrigger value="weekend" data-testid="tab-weekend">
            Weekend
          </TabsTrigger>
        </TabsList>
        <TabsContent value="weekday">
          <TemplateEditor templateType="weekday" />
        </TabsContent>
        <TabsContent value="weekend">
          <TemplateEditor templateType="weekend" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
