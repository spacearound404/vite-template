import type { NavigateOptions } from "react-router-dom";

import { HeroUIProvider } from "@heroui/system";
import { useHref, useNavigate } from "react-router-dom";
import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Input, Textarea } from "@heroui/input";
import { Button } from "@heroui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { DatePicker } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { createTask, updateTask, deleteTask, getProjects, Project, getTasks, getEvents, getMySettings } from "@/lib/api";

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

type PriorityLevel = "low" | "medium" | "high";
type TypeKind = "task" | "event";

type TaskSheetForm = {
  id: number | null;
  title: string;
  description: string;
  deadline: Date | null;
  durationHours: number;
  priority: PriorityLevel;
  importance: PriorityLevel;
  kind: TypeKind;
  eventStart: Date | null;
  eventEnd: Date | null;
  eventStartTime: string; // HH:MM
  eventEndTime: string;   // HH:MM
  recurrence: {
    repeat: "none" | "daily" | "weekly" | "monthly";
    weeklyDays: number[]; // 0..6, Monday=0
    end: { type: "never" | "until"; until: Date | null };
  };
  projectId: number | null;
};

type TaskSheetContextValue = {
  openTaskSheet: (initial?: Partial<TaskSheetForm>) => void;
  closeTaskSheet: () => void;
  todayEventsCount: number;
  setTodayEventsCount: (n: number) => void;
};

const TaskSheetContext = createContext<TaskSheetContextValue | undefined>(undefined);

export function useTaskSheet(): TaskSheetContextValue {
  const ctx = useContext(TaskSheetContext);
  if (!ctx) throw new Error("useTaskSheet must be used within Provider");
  return ctx;
}

export function Provider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [todayEventsCount, setTodayEventsCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [capacityHint, setCapacityHint] = useState<{ exceeds: boolean; pct: number; used: number; limit: number; loading: boolean } | null>(null);
  const [form, setForm] = useState<TaskSheetForm>({
    id: null,
    title: "",
    description: "",
    deadline: null,
    durationHours: 1,
    priority: "medium",
    importance: "medium",
    kind: "task",
    eventStart: null,
    eventEnd: null,
    eventStartTime: "09:00",
    eventEndTime: "10:00",
    recurrence: { repeat: "none", weeklyDays: [], end: { type: "never", until: null } },
    projectId: null,
  });

  const [projectsList, setProjectsList] = useState<Project[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projs = await getProjects();
        if (!cancelled) setProjectsList(projs);
      } catch {}
    })();
    const onProj = (e: any) => {
      const p = e?.detail;
      if (p && typeof p.id === 'number') {
        setProjectsList((prev) => {
          if (prev.some(x => x.id === p.id)) return prev;
          return [p, ...prev];
        });
      } else {
        // fallback: refetch
        (async () => {
          try { const projs = await getProjects(); setProjectsList(projs); } catch {}
        })();
      }
    };
    window.addEventListener("projects:changed", onProj as any);
    return () => { cancelled = true; window.removeEventListener("projects:changed", onProj as any); };
  }, []);

  const openTaskSheet = useCallback((initial?: Partial<TaskSheetForm>) => {
    setForm((prev) => ({
      id: initial?.id ?? null,
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      deadline: initial?.deadline ?? null,
      durationHours: initial?.durationHours ?? 1,
      priority: initial?.priority ?? "medium",
      importance: initial?.importance ?? "medium",
      kind: initial?.kind ?? "task",
      eventStart: initial?.eventStart ?? null,
      eventEnd: initial?.eventEnd ?? null,
      eventStartTime: initial?.eventStart ? `${String(initial.eventStart.getHours()).padStart(2, "0")}:${String(initial.eventStart.getMinutes()).padStart(2, "0")}` : (prev.eventStartTime || "09:00"),
      eventEndTime: initial?.eventEnd ? `${String(initial.eventEnd.getHours()).padStart(2, "0")}:${String(initial.eventEnd.getMinutes()).padStart(2, "0")}` : (prev.eventEndTime || "10:00"),
      recurrence: initial?.recurrence ?? { repeat: "none", weeklyDays: [], end: { type: "never", until: null } },
      projectId: initial?.projectId ?? null,
    }));
    setSaveError(null);
    setCapacityHint(null);
    setIsOpen(true);
  }, []);

  const closeTaskSheet = useCallback(() => setIsOpen(false), []);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setSaveError(null);
      if (!form.title.trim()) {
        setSaveError("Введите название");
        setSaving(false);
        return;
      }
      const toDateStr = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);
      const combineDateTime = (d: Date | null, time: string | null) => {
        if (!d) return null;
        const [hh, mm] = (time || "00:00").split(":");
        const yyyy = d.getFullYear();
        const mon = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const h = String(Number(hh || 0)).padStart(2, "0");
        const m = String(Number(mm || 0)).padStart(2, "0");
        return `${yyyy}-${mon}-${day}T${h}:${m}:00`;
      };
      const payload: any = {
        title: form.title,
        description: form.description,
        duration_hours: form.durationHours,
        priority: form.priority,
        importance: form.importance,
        kind: form.kind,
      };
      if (form.projectId !== null && form.projectId !== undefined) {
        payload.project_id = form.projectId;
      }
      if (form.kind === "task") {
        payload.deadline = toDateStr(form.deadline);
      } else {
        payload.event_start = combineDateTime(form.eventStart, form.eventStartTime);
        payload.event_end = combineDateTime(form.eventEnd, form.eventEndTime);
      }
      let saved: any;
      if (form.id != null) {
        saved = await updateTask(form.id, payload);
      } else {
        saved = await createTask(payload);
      }
      window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: form.id != null ? "updated" : "created", task: saved } }));
      setIsOpen(false);
    } catch (e: any) {
      setSaveError(e?.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }, [form]);

  // Capacity check for task kind when deadline or duration changes
  useEffect(() => {
    let aborted = false;
    (async () => {
      if (form.kind !== "task" || !form.deadline) { setCapacityHint(null); return; }
      setCapacityHint((prev) => prev ? { ...prev, loading: true } : { exceeds: false, pct: 0, used: 0, limit: 0, loading: true });
      try {
        const dayStr = dateToCalendar(form.deadline);
        const start = new Date(form.deadline.getFullYear(), form.deadline.getMonth(), form.deadline.getDate());
        const end = new Date(form.deadline.getFullYear(), form.deadline.getMonth(), form.deadline.getDate(), 23, 59, 59, 999);
        const [tasks, events, settings] = await Promise.all([
          getTasks({ day: dayStr }),
          getEvents({ start: start.toISOString(), end: end.toISOString() }),
          getMySettings(),
        ]);
        if (aborted) return;
        const existingTasks = (tasks as any[]).filter(t => (t.kind ?? "task") === "task");
        const sumTaskHours = existingTasks.reduce((sum, t: any) => sum + (t.duration_hours ?? 0), 0);
        // If editing existing task, exclude its previous hours (if same day)
        const old = form.id != null ? existingTasks.find((t: any) => t.id === form.id) : null;
        const adjustedTasksHours = sumTaskHours - (old?.duration_hours ?? 0) + (form.durationHours || 0);
        const overlapHours = (startIso?: string | null, endIso?: string | null): number => {
          if (!startIso || !endIso) return 0;
          const s = new Date(startIso);
          const e = new Date(endIso);
          const st = Math.max(s.getTime(), start.getTime());
          const en = Math.min(e.getTime(), end.getTime());
          const ms = Math.max(0, en - st);
          return ms / (1000 * 60 * 60);
        };
        const sumEventHours = (events as any[]).reduce((sum, ev: any) => sum + overlapHours(ev.event_start, ev.event_end), 0);
        const used = adjustedTasksHours + sumEventHours;
        const wd = form.deadline.getDay();
        const limit = wd === 0 ? (settings as any).hours_sun : wd === 1 ? (settings as any).hours_mon : wd === 2 ? (settings as any).hours_tue : wd === 3 ? (settings as any).hours_wed : wd === 4 ? (settings as any).hours_thu : wd === 5 ? (settings as any).hours_fri : (settings as any).hours_sat;
        const pct = limit > 0 ? (used / limit) * 100 : 0;
        setCapacityHint({ exceeds: pct > 100, pct, used, limit, loading: false });
      } catch {
        if (!aborted) setCapacityHint(null);
      }
    })();
    return () => { aborted = true; };
  }, [form.kind, form.deadline, form.durationHours, form.id]);

  const ctxValue = useMemo<TaskSheetContextValue>(() => ({ openTaskSheet, closeTaskSheet, todayEventsCount, setTodayEventsCount }), [openTaskSheet, closeTaskSheet, todayEventsCount]);
  const priorityLevels: PriorityLevel[] = ["low", "medium", "high"];

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref} locale="en-US">
      <TaskSheetContext.Provider value={ctxValue}>
        {children}

        {/* Global Task Bottom Sheet */}
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-[65] bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeTaskSheet}
              />
              <motion.div
                className="fixed left-0 right-0 bottom-0 z-[70] h-[80vh] rounded-t-2xl bg-background shadow-large"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 800) closeTaskSheet();
                }}
              >
                <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-default-300" />
                <div className="h-[calc(80vh-16px)] overflow-y-auto p-4 space-y-4">
                  <div>
                    <Input
                      label="Название задачи"
                      placeholder="Введите название"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                    {!form.title.trim() && saveError && (
                      <div className="mt-1 text-xs text-red-500">{saveError}</div>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-default-500">Тип</div>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button variant="flat" className="h-10 w-full">
                          {typeToLabel(form.kind)}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="type-kind"
                        selectedKeys={[form.kind] as any}
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const k = Array.from(keys)[0] as TypeKind | undefined;
                          if (k) setForm((f) => ({ ...f, kind: k }));
                        }}
                      >
                        <DropdownItem key="task">Задача</DropdownItem>
                        <DropdownItem key="event">Событие</DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                  <div>
                    <Textarea
                      label="Описание"
                      placeholder="Описание задачи"
                      minRows={3}
                      value={form.description}
                      onValueChange={(v) => setForm((f) => ({ ...f, description: v }))}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-default-500">Проект</div>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button variant="flat" className="h-10 w-full">
                          {form.projectId != null ? (projectsList.find(p => p.id === form.projectId)?.name ?? "Проект") : "Выберите проект"}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="project-select"
                        selectedKeys={form.projectId != null ? [String(form.projectId)] as any : []}
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const k = Array.from(keys)[0] as string | undefined;
                          setForm((f) => ({ ...f, projectId: k ? Number(k) : null }));
                        }}
                      >
                        {projectsList.map((p) => (
                          <DropdownItem key={String(p.id)}>{p.name}</DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                  {form.kind === "task" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <DatePicker
                          label="Дедлайн"
                          value={form.deadline ? parseDate(dateToCalendar(form.deadline)) : null as any}
                          onChange={(val: any) => {
                            if (!val) {
                              setForm((f) => ({ ...f, deadline: null }));
                              return;
                            }
                            const y = val.year; const m = (val.month ?? 1) - 1; const d = val.day ?? 1;
                            setForm((f) => ({ ...f, deadline: new Date(y, m, d) }));
                          }}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          label="Часы"
                          min={0}
                          step={0.5}
                          value={String(form.durationHours)}
                          onChange={(e) => setForm((f) => ({ ...f, durationHours: Math.max(0, Number(e.target.value || 0)) }))}
                        />
                        {capacityHint && !capacityHint.loading && (
                          <div className={`mt-1 text-xs ${capacityHint.exceeds ? "text-red-600" : "text-default-500"}`}>
                            {capacityHint.exceeds ? `Превышение дневной Capacity: ${Math.round(capacityHint.pct)}% (использовано ${capacityHint.used.toFixed(1)}ч из ${capacityHint.limit}ч)` : `Будет занято: ${Math.round(capacityHint.pct)}% (${capacityHint.used.toFixed(1)}ч из ${capacityHint.limit}ч)`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <DatePicker
                          granularity="day"
                          label="Start date"
                          value={form.eventStart ? parseDate(dateToCalendar(form.eventStart)) : null as any}
                          onChange={(val: any) => {
                            if (!val) { setForm((f) => ({ ...f, eventStart: null })); return; }
                            const y = val.year; const m = (val.month ?? 1) - 1; const d = val.day ?? 1;
                            const next = new Date(y, m, d);
                            setForm((f) => {
                              const needSetEnd = !f.eventEnd || (f.eventEnd < next);
                              return { ...f, eventStart: next, eventEnd: needSetEnd ? next : f.eventEnd };
                            });
                          }}
                          className="w-full"
                        />
                        <DatePicker
                          granularity="day"
                          label="End date"
                          value={form.eventEnd ? parseDate(dateToCalendar(form.eventEnd)) : null as any}
                          onChange={(val: any) => {
                            if (!val) { setForm((f) => ({ ...f, eventEnd: null })); return; }
                            const y = val.year; const m = (val.month ?? 1) - 1; const d = val.day ?? 1;
                            const next = new Date(y, m, d);
                            setForm((f) => {
                              // ensure end is not before start
                              const start = f.eventStart;
                              const fixed = start && next < start ? start : next;
                              return { ...f, eventEnd: fixed };
                            });
                          }}
                          className="w-full"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          type="time"
                          label="Start time"
                          value={form.eventStartTime}
                          onChange={(e) => {
                            const v = (e.target as HTMLInputElement).value || "00:00";
                            setForm((f) => {
                              let endTime = f.eventEndTime || "00:00";
                              // If same day and end <= start, bump end +1h
                              if (f.eventStart && f.eventEnd && dateToCalendar(f.eventStart) === dateToCalendar(f.eventEnd)) {
                                const [sh, sm] = v.split(":").map(Number);
                                const [eh, em] = (endTime || "00:00").split(":").map(Number);
                                const startMin = sh * 60 + (sm || 0);
                                const endMin = (eh || 0) * 60 + (em || 0);
                                if (!f.eventEndTime || endMin <= startMin) {
                                  const bumped = startMin + 60;
                                  const bh = Math.floor(bumped / 60);
                                  const bm = bumped % 60;
                                  endTime = `${String(bh % 24).padStart(2, "0")}:${String(bm).padStart(2, "0")}`;
                                }
                              }
                              return { ...f, eventStartTime: v, eventEndTime: endTime };
                            });
                          }}
                          step={900 as any}
                        />
                        <Input
                          type="time"
                          label="End time"
                          value={form.eventEndTime}
                          onChange={(e) => {
                            const v = (e.target as HTMLInputElement).value || "00:00";
                            setForm((f) => {
                              // If end date earlier than start date, align end date to start
                              let endDate = f.eventEnd;
                              if (f.eventStart && f.eventEnd && f.eventEnd < f.eventStart) endDate = f.eventStart;
                              return { ...f, eventEndTime: v, eventEnd: endDate };
                            });
                          }}
                          step={900 as any}
                        />
                      </div>
                    </div>
                  )}
                  {form.kind === "task" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-xs text-default-500">Срочность</div>
                        <div className="flex items-stretch gap-2">
                          {priorityLevels.map((lvl) => {
                            const isActive = form.priority === lvl;
                            const isFilled = priorityLevels.indexOf(lvl) <= priorityLevels.indexOf(form.priority);
                            return (
                              <button
                                key={lvl}
                                className={`flex-1 h-3 rounded-full border transition-colors ${isFilled ? "bg-black" : "bg-white/10"}`}
                                onClick={() => setForm((f) => ({ ...f, priority: lvl }))}
                                aria-pressed={isActive}
                                aria-label={`Срочность: ${priorityToLabel(lvl)}`}
                                title={priorityToLabel(lvl)}
                              >
                                
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-default-500">Важность</div>
                        <div className="flex items-stretch gap-2">
                          {priorityLevels.map((lvl) => {
                            const isActive = form.importance === lvl;
                            const isFilled = priorityLevels.indexOf(lvl) <= priorityLevels.indexOf(form.importance);
                            return (
                              <button
                                key={lvl}
                                className={`flex-1 h-3 rounded-full border transition-colors ${isFilled ? "bg-black" : "bg-white/10"}`}
                                onClick={() => setForm((f) => ({ ...f, importance: lvl }))}
                                aria-pressed={isActive}
                                aria-label={`Важность: ${priorityToLabel(lvl)}`}
                                title={priorityToLabel(lvl)}
                              >
                                
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {saveError && <div className="text-xs text-red-500">{saveError}</div>}
                  <div className="pt-2">
                    <Button className="w-full bg-black text-white" isDisabled={saving} onClick={handleSave}>{saving ? "Сохранение…" : "Сохранить"}</Button>
                  </div>
                  {form.kind === "event" && form.id != null && (
                    <div className="pt-2">
                      <Button color="danger" className="w-full" isDisabled={saving} onClick={async () => {
                        try {
                          setSaving(true);
                          await deleteTask(form.id!);
                          window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "deleted", task: { id: form.id, kind: "event" } } }));
                          setIsOpen(false);
                        } finally {
                          setSaving(false);
                        }
                      }}>Удалить</Button>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </TaskSheetContext.Provider>
    </HeroUIProvider>
  );
}

function priorityToLabel(p: PriorityLevel): string {
  return p === "low" ? "Низкий" : p === "high" ? "Высокий" : "Средний";
}

function typeToLabel(t: TypeKind): string {
  return t === "event" ? "Событие" : "Задача";
}

function repeatToLabel(r: "none" | "daily" | "weekly" | "monthly"): string {
  switch (r) {
    case "daily": return "Ежедневно";
    case "weekly": return "Еженедельно";
    case "monthly": return "Ежемесячно";
    default: return "Нет";
  }
}

function endToLabel(t: "never" | "until"): string {
  return t === "until" ? "До даты" : "Никогда";
}

function dateToCalendar(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdaysShort() {
  return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
}
