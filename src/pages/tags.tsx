import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import DefaultLayout from "@/layouts/default";
import { useTaskSheet } from "@/provider";
import React from "react";

type Project = { id: string; name: string; color: string; tasks: { id: string; title: string; date: string }[] };

const initialProjects: Project[] = [
  {
    id: "p1",
    name: "Дом",
    color: "#BBF7D0",
    tasks: [
      { id: "t1", title: "Покупки в магазин", date: "1.09" },
      { id: "t2", title: "Убраться на кухне", date: "2.09" },
    ],
  },
  {
    id: "p2",
    name: "Работа",
    color: "#BFDBFE",
    tasks: [
      { id: "t3", title: "Согласовать ТЗ", date: "3.09" },
      { id: "t4", title: "Встреча с клиентом", date: "4.09" },
      { id: "t5", title: "Подготовить отчёт", date: "5.09" },
    ],
  },
  {
    id: "p3",
    name: "Личное",
    color: "#FECACA",
    tasks: [
      { id: "t6", title: "Спортзал", date: "6.09" },
    ],
  },
];

export default function TagsPage() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#FECACA");
  const { openTaskSheet } = useTaskSheet();

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

  const createProject = () => {
    if (!newName.trim()) return;
    const newProject: Project = {
      id: Math.random().toString(36).slice(2),
      name: newName.trim(),
      color: newColor,
      tasks: [],
    };
    setProjects(prev => [newProject, ...prev]);
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
                          <div className="relative z-10 rounded-lg border border-default bg-background p-3 shadow-sm select-none cursor-pointer" onClick={() => openTaskSheet({ title: t.title })}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm leading-snug text-foreground select-none">{t.title}</div>
                              <div className="shrink-0 pl-2 text-xs text-default-500">{t.date}</div>
                            </div>
                            <div className="pointer-events-none absolute left-3 right-2 flex items-center gap-3" style={{ bottom: 2 }}>
                              <div className="flex items-center">
                                <LevelBar level={"medium"} />
                              </div>
                              <div className="flex items-center">
                                <LevelBar level={"medium"} />
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
                  <Button color="primary" onClick={createProject} className="w-full">Создать</Button>
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


