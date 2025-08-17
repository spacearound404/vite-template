import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import DefaultLayout from "@/layouts/default";
import { useTaskSheet } from "@/provider";
import { createProject, getProjects, getTasks, Project, Task } from "@/lib/api";
import React from "react";

type ProjectVM = Project & { tasks: Task[] };

function weightLevel(x?: "low" | "medium" | "high") {
  return x === "high" ? 2 : x === "medium" ? 1 : 0;
}
function dateKey(s?: string | null) {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(s);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}
function compareTasks(a: Task, b: Task) {
  const dk = dateKey(a.deadline as any) - dateKey(b.deadline as any);
  if (dk !== 0) return dk;
  const p = weightLevel(b.priority as any) - weightLevel(a.priority as any);
  if (p !== 0) return p;
  return weightLevel(b.importance as any) - weightLevel(a.importance as any);
}
function formatShortDate(iso?: string | null) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const d = String(Number(parts[2]));
  const m = String(Number(parts[1])).padStart(2, "0");
  return `${d}.${m}`;
}

export default function TagsPage() {
  const [projects, setProjects] = useState<ProjectVM[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#FECACA");
  const { openTaskSheet } = useTaskSheet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const projs = await getProjects();
        const items: ProjectVM[] = [];
        for (const p of projs) {
          const tasks = (await getTasks({ project_id: p.id })).sort(compareTasks);
          items.push({ ...p, tasks });
        }
        if (!cancelled) setProjects(items);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "load error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const onTasks = (e: any) => {
      const saved = e?.detail?.task as Task | undefined;
      if (!saved) return;
      setProjects((prev) => {
        const pid = (saved as any).project_id ?? null;
        return prev.map((p) => {
          if (p.id !== pid) return p;
          const exists = p.tasks.some((t) => t.id === saved.id);
          const nextTasks = exists ? p.tasks.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...p.tasks];
          nextTasks.sort(compareTasks);
          return { ...p, tasks: nextTasks };
        });
      });
    };
    window.addEventListener("tasks:changed", onTasks as any);
    return () => { cancelled = true; window.removeEventListener("tasks:changed", onTasks as any); };
  }, []);

  const colors = useMemo(
    () => [
      "#FECACA", "#FED7AA", "#FDE68A", "#FEF08A", "#D9F99D",
      "#BBF7D0", "#A7F3D0", "#99F6E4", "#A5F3FC", "#BAE6FD",
      "#BFDBFE", "#C7D2FE", "#DDD6FE", "#E9D5FF", "#FBCFE8",
    ],
    [],
  );

  const totalTasks = useMemo(() => projects.reduce((sum, p) => sum + p.tasks.length, 0), [projects]);

  const toggleOpen = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    const created = await createProject({ name: newName.trim(), color: newColor });
    setProjects(prev => [{ ...created, tasks: [] }, ...prev]);
    // notify others (e.g., task modal) about new project
    window.dispatchEvent(new CustomEvent("projects:changed", { detail: created }));
    setNewName("");
    setNewColor(colors[0]);
    setIsSheetOpen(false);
  };

  return (
    <DefaultLayout>
      <div className="py-2">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-extrabold text-2xl">Проекты</div>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-default-200 text-xs text-default-600">{totalTasks}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {loading && <span className="text-default-500">Загрузка…</span>}
            {error && <span className="text-red-500">{error}</span>}
          </div>
          <button
            aria-label="Добавить проект"
            className="grid h-8 w-8 place-items-center rounded-md bg-default-200 text-foreground"
            onClick={() => setIsSheetOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
          </button>
        </div>

        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border border-default">
              <button
                className="flex w-full items-center justify-between gap-2 px-3 py-2"
                onClick={() => toggleOpen(p.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-1.5 rounded" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-default-200 text-xs text-default-600">{p.tasks.length}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-default-500">
                  <span className="text-default-400">{openIds.has(p.id) ? "▾" : "▸"}</span>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {openIds.has(p.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-3 pb-3"
                  >
                    <div className="rounded-xl border border-default p-2 max-h-[40vh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain">
                      {p.tasks.length === 0 && (
                        <div className="py-6 text-center text-default-500">Нет задач</div>
                      )}
                      {p.tasks.map((t) => (
                        <div key={t.id} className="mb-3 last:mb-0">
                          <div
                            className="relative z-10 rounded-lg border border-default bg-background p-3 shadow-sm select-none cursor-pointer"
                            onClick={() => {
                              const d = (t as any).deadline as string | undefined;
                              const parts = d ? d.split("-") : [];
                              const deadline = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) : null;
                              openTaskSheet({
                                id: Number(t.id),
                                title: t.title,
                                description: (t as any).description ?? "",
                                priority: (t as any).priority ?? "medium",
                                importance: (t as any).importance ?? "medium",
                                projectId: (t as any).project_id ?? p.id,
                                deadline,
                                kind: "task",
                              });
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm leading-snug text-foreground select-none">{t.title}</div>
                              <div className="shrink-0 pl-2 text-xs text-default-500">{formatShortDate((t as any).deadline as any)}</div>
                            </div>
                            <div className="pointer-events-none absolute left-3 right-2 flex items-center gap-3" style={{ bottom: 2 }}>
                              <div className="flex items-center">
                                <LevelBar level={((t as any).priority ?? "medium")} />
                              </div>
                              <div className="flex items-center">
                                <LevelBar level={((t as any).importance ?? "medium")} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isSheetOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSheetOpen(false)}
            />
            <motion.div
              className="fixed left-0 right-0 bottom-0 z-50 h-[40vh] rounded-t-2xl bg-background shadow-large"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-default-300" />
              <div className="h-[calc(40vh-16px)] overflow-y-auto p-4 space-y-4">
                <div className="text-lg font-semibold">Создать проект</div>
                <div>
                  <label className="mb-1 block text-xs text-default-500">Название</label>
                  <Input size="sm" value={newName} onValueChange={setNewName} placeholder="Название проекта" />
                </div>
                <div>
                  <div className="mb-2 text-xs text-default-500">Цвет проекта</div>
                  <div className="grid grid-cols-8 gap-2">
                    {colors.map((c) => (
                      <button
                        key={c}
                        className={`h-6 w-6 rounded ${newColor === c ? "ring-2 ring-offset-2 ring-default-500" : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setNewColor(c)}
                      />
                    ))}
                  </div>
                </div>
                <div className="pt-2">
                  <Button onClick={handleCreateProject} className="w-full bg-black text-white">Создать</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DefaultLayout>
  );
}

function LevelBar({ level }: { level: "low" | "medium" | "high" }) {
  const filled = level === "low" ? 1 : level === "medium" ? 2 : 3;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={`h-1.5 w-3 rounded-sm ${i < filled ? "bg-black" : "bg-default-300"}`} />
      ))}
    </div>
  );
}


