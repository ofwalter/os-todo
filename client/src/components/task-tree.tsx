import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app-ui";
import { INDENT, TaskItem, TaskItemOverlay } from "./task-item";
import type { DailyTask, TaskStatus } from "@shared/schema";

interface TaskNode {
  task: DailyTask;
  children: TaskNode[];
  depth: number;
}

function buildTree(tasks: DailyTask[]): TaskNode[] {
  const taskMap = new Map<number, TaskNode>();
  const roots: TaskNode[] = [];

  for (const task of tasks) {
    taskMap.set(task.id, { task, children: [], depth: 0 });
  }

  for (const task of tasks) {
    const node = taskMap.get(task.id)!;
    if (task.parentId && taskMap.has(task.parentId)) {
      const parent = taskMap.get(task.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByPosition = (nodes: TaskNode[]) => {
    nodes.sort((a, b) => a.task.position - b.task.position);
    for (const node of nodes) {
      sortByPosition(node.children);
    }
  };
  sortByPosition(roots);

  const setDepths = (nodes: TaskNode[], depth: number) => {
    for (const node of nodes) {
      node.depth = depth;
      setDepths(node.children, depth + 1);
    }
  };
  setDepths(roots, 0);

  return roots;
}

function getDescendantIds(tasks: DailyTask[], parentId: number): number[] {
  const ids: number[] = [];
  const children = tasks.filter((t) => t.parentId === parentId);
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(tasks, child.id));
  }
  return ids;
}

interface FlatItem {
  task: DailyTask;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

function flattenTree(
  nodes: TaskNode[],
  collapsedIds: Set<number>,
  hideCompleted: boolean,
): FlatItem[] {
  const items: FlatItem[] = [];

  const process = (nodeList: TaskNode[]) => {
    const visible = hideCompleted
      ? nodeList.filter(
          (n) =>
            n.task.status !== "complete" && n.task.status !== "skipped" && n.task.status !== "partial" && !n.task.isExempt,
        )
      : nodeList;

    for (let i = 0; i < visible.length; i++) {
      const node = visible[i];
      const isCollapsed = collapsedIds.has(node.task.id);

      items.push({
        task: node.task,
        depth: node.depth,
        hasChildren: node.children.length > 0,
        isCollapsed,
      });

      if (!isCollapsed && node.children.length > 0) {
        process(node.children);
      }
    }
  };

  process(nodes);
  return items;
}

function flattenSubtree(nodes: TaskNode[]): FlatItem[] {
  const items: FlatItem[] = [];
  const process = (nodeList: TaskNode[]) => {
    for (const node of nodeList) {
      items.push({
        task: node.task,
        depth: node.depth,
        hasChildren: node.children.length > 0,
        isCollapsed: false,
      });
      process(node.children);
    }
  };
  process(nodes);
  return items;
}

interface InlineAddChildProps {
  depth: number;
  onAdd: (title: string) => void;
  onCancel: () => void;
}

function InlineAddChild({ depth, onAdd, onCancel }: InlineAddChildProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t);
    setTitle("");
  };

  return (
    <div className="flex items-center gap-1.5 bg-muted/30 py-1.5 pr-2 pl-1 sm:pr-3">
      {/* Line up with the title column: grip + indent + chevron + status box. */}
      <span className="shrink-0" style={{ width: 20 + depth * INDENT + 24 + 28 }} aria-hidden />
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Subtask title…"
        className="flex-1 bg-card dark:bg-card"
        data-testid="input-add-child"
      />
      <Button size="sm" onClick={handleAdd} disabled={!title.trim()} data-testid="button-add-child-confirm">
        Add
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onCancel}
        aria-label="Cancel"
        data-testid="button-add-child-cancel"
      >
        <X />
      </Button>
    </div>
  );
}

interface TaskTreeProps {
  tasks: DailyTask[];
  onStatusChange: (id: number, status: TaskStatus) => void;
  onToggleCollapse: (id: number) => void;
  onToggleExempt: (id: number) => void;
  onReorder: (items: { id: number; position: number; parentId: number | null }[]) => void;
  onAddTask: (title: string) => void;
  onAddChildTask?: (parentId: number, title: string) => void;
  onCompleteDeadline?: (id: number) => void;
  onPutOffDeadline?: (id: number, days: number) => void;
  onUndoDeadline?: (id: number) => void;
  hideCompleted: boolean;
  isFuture: boolean;
  isReadOnly?: boolean;
}

export function TaskTree({
  tasks,
  onStatusChange,
  onToggleCollapse,
  onToggleExempt,
  onReorder,
  onAddTask,
  onAddChildTask,
  onCompleteDeadline,
  onPutOffDeadline,
  onUndoDeadline,
  hideCompleted,
  isFuture,
  isReadOnly = false,
}: TaskTreeProps) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<number | null>(null);

  const collapsedIds = useMemo(
    () => new Set(tasks.filter((t) => t.isCollapsed).map((t) => t.id)),
    [tasks],
  );

  const tree = useMemo(() => buildTree(tasks), [tasks]);
  const flatItems = useMemo(
    () => flattenTree(tree, collapsedIds, hideCompleted),
    [tree, collapsedIds, hideCompleted],
  );

  const hiddenIds = useMemo(() => {
    if (!activeId) return new Set<number>();
    const ids = new Set(getDescendantIds(tasks, activeId));
    ids.add(activeId);
    return ids;
  }, [activeId, tasks]);

  const activeOverlayItems = useMemo(() => {
    if (!activeId) return [];
    const findNode = (nodes: TaskNode[]): TaskNode | null => {
      for (const node of nodes) {
        if (node.task.id === activeId) return node;
        const found = findNode(node.children);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(tree);
    if (!node) return [];
    const rootDepth = node.depth;
    const adjustDepth = (n: TaskNode): TaskNode => ({
      ...n,
      depth: n.depth - rootDepth,
      children: n.children.map(adjustDepth),
    });
    return flattenSubtree([adjustDepth(node)]);
  }, [activeId, tree]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        setActiveId(null);
        return;
      }

      const activeTask = tasks.find((t) => t.id === active.id);
      const overTask = tasks.find((t) => t.id === over.id);
      if (!activeTask || !overTask) {
        setActiveId(null);
        return;
      }

      const descendantIds = new Set(getDescendantIds(tasks, activeTask.id));
      if (descendantIds.has(overTask.id)) {
        setActiveId(null);
        return;
      }

      if (activeTask.parentId === overTask.parentId) {
        const siblings = tasks
          .filter((t) => t.parentId === activeTask.parentId)
          .sort((a, b) => a.position - b.position);

        const oldIndex = siblings.findIndex((t) => t.id === active.id);
        const newIndex = siblings.findIndex((t) => t.id === over.id);
        if (oldIndex === -1 || newIndex === -1) {
          setActiveId(null);
          return;
        }

        const reordered = [...siblings];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        const items = reordered.map((t, i) => ({
          id: t.id,
          position: i,
          parentId: t.parentId,
        }));
        onReorder(items);
      } else {
        const newParentId = overTask.parentId;
        const newSiblings = tasks
          .filter((t) => t.parentId === newParentId && t.id !== activeTask.id)
          .sort((a, b) => a.position - b.position);

        const overIndex = newSiblings.findIndex((t) => t.id === over.id);
        const insertIndex = overIndex === -1 ? newSiblings.length : overIndex;

        newSiblings.splice(insertIndex, 0, activeTask);

        const oldSiblings = tasks
          .filter(
            (t) =>
              t.parentId === activeTask.parentId &&
              t.id !== activeTask.id,
          )
          .sort((a, b) => a.position - b.position);

        const items: { id: number; position: number; parentId: number | null }[] = [];

        oldSiblings.forEach((t, i) => {
          items.push({ id: t.id, position: i, parentId: t.parentId });
        });

        newSiblings.forEach((t, i) => {
          items.push({
            id: t.id,
            position: i,
            parentId: t.id === activeTask.id ? newParentId : t.parentId,
          });
        });

        onReorder(items);
      }

      requestAnimationFrame(() => {
        setActiveId(null);
      });
    },
    [tasks, onReorder],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleAddTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    onAddTask(title);
    setNewTaskTitle("");
  };

  const sortableIds = useMemo(
    () => flatItems.map((i) => i.task.id),
    [flatItems],
  );

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border/60">
            {flatItems.flatMap((item) => {
              const elements: ReactNode[] = [
                <TaskItem
                  key={item.task.id}
                  task={item.task}
                  depth={item.depth}
                  hasChildren={item.hasChildren}
                  isCollapsed={item.isCollapsed}
                  onStatusChange={onStatusChange}
                  onToggleCollapse={onToggleCollapse}
                  onToggleExempt={onToggleExempt}
                  onCompleteDeadline={onCompleteDeadline}
                  onPutOffDeadline={onPutOffDeadline}
                  onUndoDeadline={onUndoDeadline}
                  isFuture={isFuture}
                  isReadOnly={isReadOnly}
                  isDndEnabled={!isReadOnly}
                  isHiddenDuringDrag={hiddenIds.has(item.task.id)}
                  onAddChildOpen={!isReadOnly && onAddChildTask ? (id) => setAddingChildOf(id) : undefined}
                />,
              ];
              if (addingChildOf === item.task.id) {
                elements.push(
                  <InlineAddChild
                    key={`add-child-${item.task.id}`}
                    depth={item.depth + 1}
                    onAdd={(title) => {
                      onAddChildTask!(item.task.id, title);
                      setAddingChildOf(null);
                    }}
                    onCancel={() => setAddingChildOf(null)}
                  />,
                );
              }
              return elements;
            })}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeId && activeOverlayItems.length > 0 && (
            <div className="divide-y divide-border/60 rounded-xl bg-popover shadow-xl ring-1 ring-foreground/10">
              {activeOverlayItems.map((item) => (
                <TaskItemOverlay key={item.task.id} task={item.task} depth={item.depth} hasChildren={item.hasChildren} />
              ))}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {flatItems.length === 0 && (
        <EmptyState
          icon={ListChecks}
          testId="empty-tasks"
          title={tasks.length > 0 && hideCompleted ? "All done" : "No tasks for this day"}
          description={
            tasks.length > 0 && hideCompleted
              ? "Everything here is finished. Show completed tasks to see them."
              : "Set up a template, or add a task below."
          }
        />
      )}

      {!isReadOnly && (
        <form
          className="flex items-center gap-2 border-t bg-muted/30 px-3 py-3 sm:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddTask();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add a task…"
              className="h-9 bg-card pl-9 dark:bg-card"
              data-testid="input-new-task"
            />
          </div>
          <Button type="submit" variant="outline" className="h-9" disabled={!newTaskTitle.trim()} data-testid="button-add-task">
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
