import { useMemo, useRef, useState, useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Progress } from "@heroui/react";
import { useTaskSheet } from "@/provider";

type Task = {
  id: string;
  title: string;
  date: string; // e.g. 1.09
  projectColor: string; // color of the project this task belongs to
  priority?: "low" | "medium" | "high";
  importance?: "low" | "medium" | "high";
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

export default function MainPage() {
  const { leftLabel } = useMemo(() => formatHeaderDate(new Date()), []);
  const capacity = 65;

  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Купить продукты и приготовить ужин", date: "1.09", projectColor: "#BBF7D0" },
    { id: "2", title: "Собрать отчёт по проекту", date: "2.09", projectColor: "#BFDBFE" },
    { id: "3", title: "Позвонить клиенту и обсудить условия", date: "3.09", projectColor: "#BFDBFE" },
    { id: "4", title: "Сходить в спортзал", date: "4.09", projectColor: "#FECACA" },
    { id: "5", title: "Длинное название задачи, которое должно переноситься на несколько строк без обрезки текста", date: "5.09", projectColor: "#FDE68A" },
    { id: "6", title: "Прочитать главы книги по дизайну", date: "6.09", projectColor: "#DDD6FE" },
    { id: "7", title: "Подготовить презентацию", date: "7.09", projectColor: "#BFDBFE" },
    { id: "8", title: "Сходить к врачу", date: "8.09", projectColor: "#FECACA" },
    { id: "9", title: "Забронировать билеты", date: "9.09", projectColor: "#BAE6FD" },
    { id: "10", title: "Написать пост в блог", date: "10.09", projectColor: "#C7D2FE" },
  ]);

  const [overdueTasks, setOverdueTasks] = useState<Task[]>([
    { id: "o1", title: "Сдать отчёт за прошлую неделю", date: "29.08", projectColor: "#BFDBFE" },
    { id: "o2", title: "Оплатить счёт за интернет", date: "28.08", projectColor: "#FECACA" },
  ]);

  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([
    { id: "u1", title: "Подготовить тезисы к встрече", date: "12.09", projectColor: "#BFDBFE" },
    { id: "u2", title: "Сформировать список покупок", date: "15.09", projectColor: "#BBF7D0" },
  ]);

  const [showOverdue, setShowOverdue] = useState(true);
  const [showUpcoming, setShowUpcoming] = useState(true);
  // Перетаскивание по приоритету отключено

  // Ограничение списков "Просрочено" и "Заранее" до 2 карточек по фактической высоте
  const overdueListRef = useRef<HTMLDivElement | null>(null);
  const upcomingListRef = useRef<HTMLDivElement | null>(null);
  const [overdueHeight, setOverdueHeight] = useState<number>(0);
  const [upcomingHeight, setUpcomingHeight] = useState<number>(0);

  // Ссылки для ограниченных списков

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

  const handleSwipe = (id: string, direction: "left" | "right") => {
    // right = complete, left = delete
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  return (
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col py-1">
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
            <div className="rounded-xl border border-default p-2 overflow-hidden flex-1 min-h-0">
              <div className="h-full overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain">
                {tasks.map((task) => (
                  <div key={task.id} className="mb-3 last:mb-0">
                    <SwipeableTask task={task} onSwipe={handleSwipe} />
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
              <div className="rounded-xl border border-default p-2 overflow-hidden">
                <div
                  ref={overdueListRef}
                  className="overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain"
                  style={{ height: overdueHeight ? `${overdueHeight}px` : undefined }}
                >
                  {overdueTasks.map((task) => (
                    <div key={task.id} className="task-item mb-3 last:mb-0">
                      <SwipeableTask task={task} onSwipe={(id) => setOverdueTasks((prev) => prev.filter((t) => t.id !== id))} />
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
              <div className="rounded-xl border border-default p-2 overflow-hidden">
                <div
                  ref={upcomingListRef}
                  className="overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain"
                  style={{ height: upcomingHeight ? `${upcomingHeight}px` : undefined }}
                >
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="task-item mb-3 last:mb-0">
                      <SwipeableTask task={task} onSwipe={(id) => setUpcomingTasks((prev) => prev.filter((t) => t.id !== id))} />
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

function SwipeableTask({ task, onSwipe, disableSwipe = false, onLongPressStart }: { task: Task; onSwipe: (id: string, dir: "left" | "right") => void; disableSwipe?: boolean; onLongPressStart?: (e: PointerEvent | MouseEvent | TouchEvent) => void }) {
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
            openTaskSheet({ title: task.title });
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
          style={{ borderTopColor: task.projectColor }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm leading-snug text-foreground select-none">
            {task.title}
          </div>
          <div className="shrink-0 pl-2 text-xs text-default-500">{task.date}</div>
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



