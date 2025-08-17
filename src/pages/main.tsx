import { useMemo, useRef, useState, useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Progress } from "@heroui/react";
import { useTaskSheet } from "@/provider";
import { getTasks, deleteTask, getProjects, getEvents, getMySettings } from "@/lib/api";

type Task = {
  id: string;
  title: string;
  date: string; // deadline YYYY-MM-DD
  priority?: "low" | "medium" | "high";
  importance?: "low" | "medium" | "high";
  description?: string;
  projectId?: number | null;
  durationHours?: number;
};

function formatHeaderDate(d: Date): { leftLabel: string } {
  const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const monthsShort = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];
  const leftLabel = `${d.getDate()} ${monthsShort[d.getMonth()]} | ${weekdays[d.getDay()]}`;
  return { leftLabel };
}

function weightLevel(x?: "low" | "medium" | "high") {
  return x === "high" ? 2 : x === "medium" ? 1 : 0;
}
function dateKey(s?: string) {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(s);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}
function compareTasks(a: Task, b: Task) {
  const dk = dateKey(a.date) - dateKey(b.date);
  if (dk !== 0) return dk;
  const p = weightLevel(b.priority) - weightLevel(a.priority);
  if (p !== 0) return p;
  return weightLevel(b.importance) - weightLevel(a.importance);
}
function formatShortDate(iso?: string) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const d = String(Number(parts[2]));
  const m = String(Number(parts[1])).padStart(2, "0");
  return `${d}.${m}`;
}

export default function MainPage() {
  const { leftLabel } = useMemo(() => formatHeaderDate(new Date()), []);
  const [capacity, setCapacity] = useState<number>(0);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);

  const [showOverdue, setShowOverdue] = useState(true);
  const [showUpcoming, setShowUpcoming] = useState(true);
  // Перетаскивание по приоритету отключено

  // Ограничение списков "Просрочено" и "Заранее" до 2 карточек по фактической высоте
  const overdueListRef = useRef<HTMLDivElement | null>(null);
  const upcomingListRef = useRef<HTMLDivElement | null>(null);
  const [overdueHeight, setOverdueHeight] = useState<number>(0);
  const [upcomingHeight, setUpcomingHeight] = useState<number>(0);

  // Ссылки для ограниченных списков

  const { openTaskSheet } = useTaskSheet();

  const [projectColors, setProjectColors] = useState<Record<number, string>>({});

  // Индикаторы скролла на главной странице отключены

  // Load projects to know their colors
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projs = await getProjects();
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const p of projs) map[p.id] = p.color as any;
        setProjectColors(map);
      } catch {}
    })();
    const onProjChanged = async () => {
      try {
        const projs = await getProjects();
        const map: Record<number, string> = {};
        for (const p of projs) map[p.id] = p.color as any;
        setProjectColors(map);
      } catch {}
    };
    window.addEventListener("projects:changed", onProjChanged as any);
    return () => { cancelled = true; window.removeEventListener("projects:changed", onProjChanged as any); };
  }, []);

  const colorFor = (projectId?: number | null): string => {
    if (projectId == null) return "#BFDBFE";
    return projectColors[projectId] ?? "#BFDBFE";
  };

  const reloadAll = async () => {
    setLoadingTasks(true);
    try {
      const listPromise = getTasks();
      const toLocalDate = (iso?: string): Date | null => {
        if (!iso) return null;
        const parts = iso.split("-");
        if (parts.length !== 3) return null;
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const d = Number(parts[2]);
        if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
        return new Date(y, m, d);
      };
      const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const todayStart = startOfDay(new Date());
      const todayEnd = endOfDay(new Date());

      const list = await listPromise;
      const mappedAll: Task[] = list
        .filter((t: any) => (t.kind ?? "task") === "task")
        .map((t: any) => ({
          id: String(t.id),
          title: t.title,
          date: t.deadline ?? "",
          priority: t.priority ?? "medium",
          importance: t.importance ?? "medium",
          description: t.description ?? "",
          projectId: t.project_id ?? null,
          durationHours: t.duration_hours ?? 0,
        }));

      const todays: Task[] = [];
      const overdue: Task[] = [];
      const upcoming: Task[] = [];

      for (const t of mappedAll) {
        const d = toLocalDate(t.date);
        if (!d) continue;
        const day = startOfDay(d).getTime();
        const todayTs = todayStart.getTime();
        if (day === todayTs) {
          todays.push(t);
        } else if (day < todayTs) {
          overdue.push(t);
        } else {
          upcoming.push(t);
        }
      }

      setTasks(todays.sort(compareTasks));
      setOverdueTasks(overdue.sort(compareTasks));
      setUpcomingTasks(upcoming.sort(compareTasks));

      // Capacity calculation (tasks + events vs settings for today)
      try {
        const [events, settings] = await Promise.all([
          getEvents({ start: todayStart.toISOString(), end: todayEnd.toISOString() }),
          getMySettings(),
        ]);
        const usedTaskHours = todays.reduce((sum, t) => sum + (t.durationHours || 0), 0);
        const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
        const overlapHours = (startIso?: string | null, endIso?: string | null): number => {
          if (!startIso || !endIso) return 0;
          const s = new Date(startIso);
          const e = new Date(endIso);
          const start = Math.max(s.getTime(), todayStart.getTime());
          const end = Math.min(e.getTime(), todayEnd.getTime());
          const ms = Math.max(0, end - start);
          return ms / (1000 * 60 * 60);
        };
        const usedEventHours = (events as any[]).reduce((sum, ev) => sum + overlapHours(ev.event_start, ev.event_end), 0);
        const used = usedTaskHours + usedEventHours;
        const weekday = new Date().getDay();
        const weekdayCapacityHours = (() => {
          switch (weekday) {
            case 0: return (settings as any).hours_sun ?? 0;
            case 1: return (settings as any).hours_mon ?? 0;
            case 2: return (settings as any).hours_tue ?? 0;
            case 3: return (settings as any).hours_wed ?? 0;
            case 4: return (settings as any).hours_thu ?? 0;
            case 5: return (settings as any).hours_fri ?? 0;
            case 6: return (settings as any).hours_sat ?? 0;
            default: return 0;
          }
        })();
        const pct = weekdayCapacityHours > 0 ? (used / weekdayCapacityHours) * 100 : 0;
        setCapacity(clamp(pct, 0, 100));
      } catch {
        // ignore capacity errors
      }
    } finally {
      setLoadingTasks(false);
    }
  };

  // When project colors update, components will compute color on the fly via colorFor()

  useEffect(() => {
    reloadAll();
    const onChanged = () => reloadAll();
    window.addEventListener("tasks:changed", onChanged as any);
    return () => window.removeEventListener("tasks:changed", onChanged as any);
  }, []);

  useEffect(() => {
    const calc = (el: HTMLDivElement | null) => {
      if (!el) return 0;
      const items = Array.from(el.querySelectorAll<HTMLDivElement>(".task-item"));
      if (items.length === 0) return 0;
      const count = Math.min(2, items.length);
      let total = 0;
      for (let i = 0; i < count; i++) {
        const it = items[i];
        const styles = window.getComputedStyle(it);
        const mb = i < count - 1 ? parseFloat(styles.marginBottom || "0") : 0;
        total += it.offsetHeight + mb;
      }
      // Внутренние отступы контейнера p-2 (top+bottom = 16px)
      return total;
    };
    const recalc = () => {
      setOverdueHeight(calc(overdueListRef.current));
      setUpcomingHeight(calc(upcomingListRef.current));
    };
    // чуть отложим, чтобы DOM стабилизировался после анимаций/свайпа
    const id = window.setTimeout(recalc, 0);
    window.addEventListener("resize", recalc);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", recalc);
    };
  }, [overdueTasks, upcomingTasks, showOverdue, showUpcoming]);

  // Высота секций распределяется чисто через CSS Grid

  // Индикаторы скролла на главной странице отключены

  // Полностью блокируем вертикальную прокрутку страницы на этой странице
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflowY;
    const prevBodyOverflow = body.style.overflowY;
    const prevHtmlOverscroll = (html.style as any).overscrollBehaviorY;
    const prevBodyOverscroll = (body.style as any).overscrollBehaviorY;
    html.style.overflowY = "hidden";
    body.style.overflowY = "hidden";
    (html.style as any).overscrollBehaviorY = "contain";
    (body.style as any).overscrollBehaviorY = "contain";
    return () => {
      html.style.overflowY = prevHtmlOverflow;
      body.style.overflowY = prevBodyOverflow;
      (html.style as any).overscrollBehaviorY = prevHtmlOverscroll;
      (body.style as any).overscrollBehaviorY = prevBodyOverscroll;
    };
  }, []);

  const handleSwipe = async (id: string, direction: "left" | "right") => {
    // right = complete, left = delete (пока просто удаляем)
    setTasks(prev => prev.filter(t => t.id !== id));
    const apiId = Number(id);
    if (!Number.isNaN(apiId)) {
      try {
        await deleteTask(apiId);
        window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "deleted", id: apiId } }));
      } catch {}
    }
  };

  const handleSwipeIn = async (
    id: string,
    setList: React.Dispatch<React.SetStateAction<Task[]>>,
    direction: "left" | "right"
  ) => {
    setList(prev => prev.filter(t => t.id !== id));
    const apiId = Number(id);
    if (!Number.isNaN(apiId)) {
      try {
        await deleteTask(apiId);
        window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "deleted", id: apiId } }));
      } catch {}
    }
  };

  return (
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col py-1">
        <div className="mb-1 text-xs text-default-500">{loadingTasks ? "Загрузка задач…" : null}</div>
        <div className="mb-2 grid grid-cols-2 items-end gap-2">
          <div className="col-span-1 font-extrabold text-2xl md:text-4xl tracking-tight">{leftLabel}</div>
          <div className="col-span-1 w-full">
            <Progress
              classNames={{
                base: "w-full",
                track: "drop-shadow-md border border-default",
                indicator: "bg-linear-to-r from-neutral-400 via-neutral-700 to-black",
                label: "tracking-wider font-medium text-default-600",
                value: "text-foreground/60",
              }}
              label="Capacity"
              radius="sm"
              showValueLabel
              size="sm"
              value={capacity}
            />
          </div>
        </div>

        <div className="mt-4 flex-1 min-h-0 grid grid-rows-[1fr_auto_auto] gap-2">
          {/* Сегодня */}
          <div className="min-h-0 flex flex-col">
            <div className="mb-1 flex items-center gap-2 font-bold text-xl md:text-2xl">
              <span>📅 Сегодня</span>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-default-200 text-xs text-default-600">
                {tasks.length}
              </span>
            </div>
            <div className="relative rounded-xl border border-default p-2 overflow-hidden flex-1 min-h-0">
              <div className="h-full overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain">
                {tasks.map((task) => (
                  <div key={task.id} className="mb-3 last:mb-0">
                    <SwipeableTask task={task} projectColor={colorFor(task.projectId)} onSwipe={handleSwipe} onEdit={() => {
                      const parts = (task.date || "").split("-");
                      const deadline = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) : null;
                      openTaskSheet({
                        id: Number(task.id),
                        title: task.title,
                        description: task.description,
                        priority: task.priority,
                        importance: task.importance,
                        projectId: task.projectId ?? null,
                        deadline,
                        kind: "task",
                      });
                    }} />
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div className="py-12 text-center text-default-500">Список задач пуст</div>
                )}
              </div>
            </div>
          </div>

          {/* Просрочено */}
          <div className="flex flex-col mt-2 pt-2 border-t border-default-200">
            <div
              className="mb-1 flex cursor-pointer select-none items-center justify-between font-bold text-lg md:text-xl"
              onClick={() => setShowOverdue((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <span>⏰ Просрочено</span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-default-200 text-xs text-default-600">
                  {overdueTasks.length}
                </span>
              </div>
              <span className="text-default-500">{showOverdue ? "▾" : "▸"}</span>
            </div>
            {showOverdue && (
              <div className="relative rounded-xl border border-default p-2 overflow-hidden">
                <div
                  ref={overdueListRef}
                  className="overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain"
                  style={{ height: overdueHeight ? `${overdueHeight}px` : undefined }}
                >
                  {overdueTasks.map((task) => (
                    <div key={task.id} className="task-item mb-3 last:mb-0">
                      <SwipeableTask
                        task={task}
                        projectColor={colorFor(task.projectId)}
                        onSwipe={(id, dir) => handleSwipeIn(id, setOverdueTasks, dir)}
                      />
                    </div>
                  ))}
                  {overdueTasks.length === 0 && (
                    <div className="py-6 text-center text-default-500">Нет просроченных задач</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Заранее */}
          <div className="flex flex-col mt-2 pt-2 border-t border-default-200">
            <div
              className="mb-1 flex cursor-pointer select-none items-center justify-between font-bold text-lg md:text-xl"
              onClick={() => setShowUpcoming((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <span>🗓️ Заранее</span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-default-200 text-xs text-default-600">
                  {upcomingTasks.length}
                </span>
              </div>
              <span className="text-default-500">{showUpcoming ? "▾" : "▸"}</span>
            </div>
            {showUpcoming && (
              <div className="relative rounded-xl border border-default p-2 overflow-hidden">
                <div
                  ref={upcomingListRef}
                  className="overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain"
                  style={{ height: upcomingHeight ? `${upcomingHeight}px` : undefined }}
                >
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="task-item mb-3 last:mb-0">
                      <SwipeableTask
                        task={task}
                        projectColor={colorFor(task.projectId)}
                        onSwipe={(id, dir) => handleSwipeIn(id, setUpcomingTasks, dir)}
                      />
                    </div>
                  ))}
                  {upcomingTasks.length === 0 && (
                    <div className="py-6 text-center text-default-500">Нет будущих задач</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

// Перетаскивание задач отключено, ниже — только свайпы

function SwipeableTask({ task, projectColor, onSwipe, onEdit, disableSwipe = false, onLongPressStart }: { task: Task; projectColor: string; onSwipe: (id: string, dir: "left" | "right") => void; onEdit?: () => void; disableSwipe?: boolean; onLongPressStart?: (e: PointerEvent | MouseEvent | TouchEvent) => void }) {
  const threshold = 96;
  const x = useMotionValue(0);
  const leftOpacity = useTransform(x, [0, 64], [0, 1]);
  const rightOpacity = useTransform(x, [0, -64], [0, 1]);
  const [startedDirection, setStartedDirection] = useState<"horizontal" | "vertical" | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const [pressTimer, setPressTimer] = useState<any>(null);
  const { openTaskSheet } = useTaskSheet();
  const startPress = (e: any) => {
    if (!onLongPressStart) return;
    const nativeEvt = e?.nativeEvent as PointerEvent | MouseEvent | TouchEvent;
    const t = setTimeout(() => onLongPressStart(nativeEvt), 250);
    setPressTimer(t);
  };
  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    setPressTimer(null);
  };
  return (
    <div className="relative mb-3 last:mb-0">
      {/* Underlay: success (right swipe) */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-start rounded-lg bg-blue-500 pl-4"
        style={{ opacity: leftOpacity }}
      >
        <CheckIcon className="text-white" />
      </motion.div>
      {/* Underlay: danger (left swipe) */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-end rounded-lg bg-red-500 pr-4"
        style={{ opacity: rightOpacity }}
      >
        <TrashIcon className="text-white" />
      </motion.div>
      <motion.div
        className="relative z-10 rounded-lg border border-default bg-background p-3 shadow-sm select-none"
        drag={disableSwipe || startedDirection === "vertical" ? false : "x"}
        dragConstraints={{ left: -200, right: 200 }}
        dragElastic={0.2}
        dragMomentum={false}
        style={{ x }}
        onTap={() => {
          if (startedDirection !== "horizontal") {
            if (onEdit) onEdit(); else openTaskSheet({ title: task.title });
          }
        }}
        onPointerDown={(e) => {
          startPoint.current = { x: e.clientX, y: e.clientY };
          // старт долгого нажатия
          startPress(e);
        }}
        onPointerMove={(e) => {
          if (!startPoint.current) return;
          const dx = Math.abs(e.clientX - startPoint.current.x);
          const dy = Math.abs(e.clientY - startPoint.current.y);
          if (!startedDirection) {
            if (dx > 8 && dx > dy) setStartedDirection("horizontal");
            else if (dy > 8 && dy > dx) setStartedDirection("vertical");
          }
          // если пошёл горизонтальный свайп — блокируем long-press (чтобы не включался drag)
          if (startedDirection === "horizontal" && pressTimer) {
            clearTimeout(pressTimer);
          }
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x > threshold) {
            onSwipe(task.id, "right");
          } else if (info.offset.x < -threshold) {
            onSwipe(task.id, "left");
          } else {
            // Snap back to center if not passed the threshold
            animate(x, 0, { type: "spring", stiffness: 400, damping: 35 });
          }
        }}
        whileTap={{ scale: 0.98 }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
      >
        {/* colored project corner */}
        <span
          className="pointer-events-none absolute left-0 top-0 h-0 w-0 border-r-[14px] border-t-[14px] border-r-transparent rounded-tl-lg"
          style={{ borderTopColor: projectColor }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm leading-snug text-foreground select-none">
            {task.title}
          </div>
          <div className="shrink-0 pl-2 text-xs text-default-500">{formatShortDate(task.date)}</div>
        </div>
        <div className="pointer-events-none absolute left-3 right-2 flex items-center gap-3" style={{ bottom: 2 }}>
          <div className="flex items-center">
            <LevelBar level={task.priority ?? "medium"} />
          </div>
          <div className="flex items-center">
            <LevelBar level={task.importance ?? "medium"} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LevelBar({ level }: { level: "low" | "medium" | "high" }) {
  const filled = level === "low" ? 1 : level === "medium" ? 2 : 3;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={`h-1 w-2 rounded-sm ${i < filled ? "bg-black" : "bg-default-300"}`} />
      ))}
    </div>
  );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}



