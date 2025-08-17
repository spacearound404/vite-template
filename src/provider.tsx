import type { NavigateOptions } from "react-router-dom";

import { HeroUIProvider } from "@heroui/system";
import { useHref, useNavigate } from "react-router-dom";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Input, Textarea } from "@heroui/input";
import { Button } from "@heroui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { DatePicker } from "@heroui/react";
import { parseDate } from "@internationalized/date";

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

type PriorityLevel = "low" | "medium" | "high";
type TypeKind = "task" | "event";

type TaskSheetForm = {
  title: string;
  description: string;
  deadline: Date | null;
  durationHours: number;
  priority: PriorityLevel;
  importance: PriorityLevel;
  kind: TypeKind;
  eventStart: Date | null;
  eventEnd: Date | null;
  recurrence: {
    repeat: "none" | "daily" | "weekly" | "monthly";
    weeklyDays: number[]; // 0..6, Monday=0
    end: { type: "never" | "until"; until: Date | null };
  };
  projectId: string | null;
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
  const [form, setForm] = useState<TaskSheetForm>({
    title: "",
    description: "",
    deadline: null,
    durationHours: 1,
    priority: "medium",
    importance: "medium",
    kind: "task",
    eventStart: null,
    eventEnd: null,
    recurrence: { repeat: "none", weeklyDays: [], end: { type: "never", until: null } },
    projectId: null,
  });

  const openTaskSheet = useCallback((initial?: Partial<TaskSheetForm>) => {
    setForm((prev) => ({
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      deadline: initial?.deadline ?? null,
      durationHours: initial?.durationHours ?? 1,
      priority: initial?.priority ?? "medium",
      importance: initial?.importance ?? "medium",
      kind: initial?.kind ?? "task",
      eventStart: initial?.eventStart ?? null,
      eventEnd: initial?.eventEnd ?? null,
      recurrence: initial?.recurrence ?? { repeat: "none", weeklyDays: [], end: { type: "never", until: null } },
      projectId: initial?.projectId ?? null,
    }));
    setIsOpen(true);
  }, []);

  const closeTaskSheet = useCallback(() => setIsOpen(false), []);

  const ctxValue = useMemo<TaskSheetContextValue>(() => ({ openTaskSheet, closeTaskSheet, todayEventsCount, setTodayEventsCount }), [openTaskSheet, closeTaskSheet, todayEventsCount]);
  const projectsList = useMemo(() => [
    { id: "p1", name: "Дом" },
    { id: "p2", name: "Работа" },
    { id: "p3", name: "Личное" },
  ], []);
  const priorityLevels: PriorityLevel[] = ["low", "medium", "high"];

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref}>
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
                          {form.projectId ? (projectsList.find(p => p.id === form.projectId)?.name ?? "Проект") : "Выберите проект"}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="project-select"
                        selectedKeys={form.projectId ? [form.projectId] as any : []}
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const k = Array.from(keys)[0] as string | undefined;
                          setForm((f) => ({ ...f, projectId: k ?? null }));
                        }}
                      >
                        {projectsList.map((p) => (
                          <DropdownItem key={p.id}>{p.name}</DropdownItem>
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
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <DatePicker
                          label="Дата начала"
                          value={form.eventStart ? parseDate(dateToCalendar(form.eventStart)) : null as any}
                          onChange={(val: any) => {
                            if (!val) { setForm((f) => ({ ...f, eventStart: null })); return; }
                            const y = val.year; const m = (val.month ?? 1) - 1; const d = val.day ?? 1;
                            setForm((f) => ({ ...f, eventStart: new Date(y, m, d) }));
                          }}
                          className="w-full"
                        />
                        <DatePicker
                          label="Дата конца"
                          value={form.eventEnd ? parseDate(dateToCalendar(form.eventEnd)) : null as any}
                          onChange={(val: any) => {
                            if (!val) { setForm((f) => ({ ...f, eventEnd: null })); return; }
                            const y = val.year; const m = (val.month ?? 1) - 1; const d = val.day ?? 1;
                            setForm((f) => ({ ...f, eventEnd: new Date(y, m, d) }));
                          }}
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 text-xs text-default-500">Дни недели</div>
                          <div className="flex flex-wrap gap-2">
                            {weekdaysShort().map((label, idx) => {
                              const selected = form.recurrence.weeklyDays.includes(idx);
                              return (
                                <button
                                  key={idx}
                                  className={`h-8 w-8 rounded-full border grid place-items-center text-xs ${selected ? "ring-2 ring-offset-2 ring-black" : ""}`}
                                  onClick={() => {
                                    setForm((f) => {
                                      const has = f.recurrence.weeklyDays.includes(idx);
                                      const list = has ? f.recurrence.weeklyDays.filter((d) => d !== idx) : [...f.recurrence.weeklyDays, idx];
                                      return { ...f, recurrence: { ...f.recurrence, weeklyDays: list } };
                                    });
                                  }}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-default-500">Окончание</div>
                          <Dropdown>
                            <DropdownTrigger>
                              <Button variant="flat" className="h-10 w-full">
                                {endToLabel(form.recurrence.end.type)}
                              </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                              aria-label="repeat-end"
                              selectedKeys={[form.recurrence.end.type] as any}
                              selectionMode="single"
                              onSelectionChange={(keys) => {
                                const k = Array.from(keys)[0] as "never" | "until" | undefined;
                                if (!k) return;
                                setForm((f) => ({ ...f, recurrence: { ...f.recurrence, end: { type: k, until: k === "until" ? f.recurrence.end.until : null } } }));
                              }}
                            >
                              <DropdownItem key="never">Никогда</DropdownItem>
                              <DropdownItem key="until">До даты</DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </div>
                        {form.recurrence.end.type === "until" && (
                          <div className="grid grid-cols-2 gap-3">
                            <DatePicker
                              label="До даты"
                              value={form.recurrence.end.until ? parseDate(dateToCalendar(form.recurrence.end.until)) : null as any}
                              onChange={(val: any) => {
                                if (!val) { setForm((f) => ({ ...f, recurrence: { ...f.recurrence, end: { type: "until", until: null } } })); return; }
                                const y = val.year; const m = (val.month ?? 1) - 1; const d = val.day ?? 1;
                                setForm((f) => ({ ...f, recurrence: { ...f.recurrence, end: { type: "until", until: new Date(y, m, d) } } }));
                              }}
                              className="w-full"
                            />
                          </div>
                        )}
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
                  <div className="pt-2">
                    <Button className="w-full bg-black text-white" onClick={closeTaskSheet}>Сохранить</Button>
                  </div>
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
