import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DatePicker } from "@heroui/react";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { parseDate, getLocalTimeZone, today } from "@internationalized/date";
import DefaultLayout from "@/layouts/default";
import { useTaskSheet } from "@/provider";

type EventItem = { id: string; title: string; color: string; start: Date; end: Date };

export default function DaysPage() {
  const { openTaskSheet, setTodayEventsCount } = useTaskSheet();
  const [mode, setMode] = useState<"hours" | "days">("hours");
  const [events, setEvents] = useState<EventItem[]>(() => {
    const today = startOfDay(new Date());
    const mk = (h: number, m: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0, 0);
    const tomorrow = startOfDay(new Date(today.getTime() + 24 * 3600 * 1000));
    const mkT = (h: number, m: number) => new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), h, m, 0, 0);
    return [
      { id: "e1", title: "Встреча", color: "#BFDBFE", start: mk(10, 0), end: mk(11, 30) },
      { id: "e2", title: "Тренировка", color: "#BBF7D0", start: mk(18, 0), end: mk(19, 0) },
      { id: "e3", title: "Звонок", color: "#FDE68A", start: mkT(9, 15), end: mkT(9, 45) },
    ];
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<{ dayKey: string; start: Date; end: Date } | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const monthsBarRef = useRef<HTMLDivElement | null>(null);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_PX = 64; // высота часа в пикселях (увеличено для крупных блоков)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectingRef = useRef<{ startMinutes: number; day: Date; pointerId: number; initialY: number } | null>(null);
  const resizeEdgeRef = useRef<null | 'top' | 'bottom'>(null);
  const pressTimerRef = useRef<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const hasAutoScrolledRef = useRef(false);

  const daysList = useMemo(() => [selectedDate], [selectedDate]);

  // Конвертируем Date в формат для DatePicker
  const selectedDateValue = useMemo(() => {
    return parseDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`);
  }, [selectedDate]);

  useEffect(() => {
    // scroll to selected day
    const key = dayKey(selectedDate);
    const el = dayRefs.current.get(key);
    const cont = containerRef.current;
    if (el && cont) {
      cont.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    }
    // sync month view with selected date in days mode
    const m = new Date(selectedDate);
    m.setDate(1);
    m.setHours(0, 0, 0, 0);
    setViewMonth(m);
  }, [daysList]);

  // Update badge with number of today's events
  useEffect(() => {
    const todayKey = dayKey(new Date());
    const count = events.filter(e => dayKey(e.start) === todayKey).length;
    setTodayEventsCount(count);
  }, [events]);

  // Обновляем текущее время для индикатора (минутная точность)
  useEffect(() => {
    const update = () => setNow(new Date());
    // выровнять к началу следующей минуты
    const msToNextMinute = 60000 - (Date.now() % 60000);
    const t1 = window.setTimeout(() => {
      update();
      const interval = window.setInterval(update, 60000);
      (update as any)._int = interval;
    }, msToNextMinute);
    return () => {
      window.clearTimeout(t1);
      if ((update as any)._int) window.clearInterval((update as any)._int);
    };
  }, []);

  // Автопрокрутка к ближайшему событию (или к текущему времени, если сегодня и событий нет)
  useEffect(() => {
    if (mode !== 'hours') {
      hasAutoScrolledRef.current = false;
      return;
    }
    const cont = containerRef.current;
    if (!cont) return;
    const selKey = dayKey(selectedDate);
    const el = dayRefs.current.get(selKey);
    if (!el) return;

    if (hasAutoScrolledRef.current) return;

    const dayEvents = events
      .filter((e) => dayKey(e.start) === selKey)
      .sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start));

    const isToday = selKey === dayKey(new Date());
    let targetMinutes: number | null = null;

    if (dayEvents.length > 0) {
      if (isToday) {
        const nowM = minutesOfDay(new Date());
        const next = dayEvents.find((ev) => minutesOfDay(ev.end) >= nowM) ?? dayEvents[dayEvents.length - 1];
        targetMinutes = Math.max(0, minutesOfDay(next.start) - 15);
      } else {
        targetMinutes = Math.max(0, minutesOfDay(dayEvents[0].start) - 15);
      }
    } else if (isToday) {
      targetMinutes = minutesOfDay(new Date());
    }

    if (targetMinutes == null) {
      hasAutoScrolledRef.current = true; // нечего скроллить
      return;
    }

    const yWithin = (targetMinutes / 60) * HOUR_PX;
    const target = Math.max(0, el.offsetTop + yWithin - cont.clientHeight * 0.3);
    const id = window.setTimeout(() => {
      cont.scrollTo({ top: target, behavior: 'smooth' });
      hasAutoScrolledRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [mode, selectedDate, events]);

  // Lock page scroll in days mode so the page doesn't move vertically
  useEffect(() => {
    if (mode !== 'days') return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [mode]);

  // Scroll selected month button into view when month changes (days mode)
  useEffect(() => {
    const bar = monthsBarRef.current;
    if (!bar) return;
    const selKey = `m-${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;
    const el = bar.querySelector(`[data-key="${selKey}"]`) as HTMLElement | null;
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
    }
  }, [viewMonth]);

  const quantizeTo15 = (minutes: number) => Math.floor(minutes / 15) * 15;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, day: Date) => {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesPerPixel = 60 / HOUR_PX;
    const rawMinutes = Math.max(0, y * minutesPerPixel);
    const startMinutes = quantizeTo15(rawMinutes);
    selectingRef.current = { startMinutes, day: startOfDay(day), pointerId: e.pointerId, initialY: y };
    // Отложенный старт (строгий long-press)
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      // Начинаем выделение только по истечении таймера
      if (!selectingRef.current) return;
      setIsSelecting(true);
      // Захватываем указатель теперь, чтобы двигать, но не блокировать скролл до этого момента
      try { (target as any).setPointerCapture?.(selectingRef.current.pointerId); } catch {}
      const base = selectingRef.current.day;
      const start = new Date(base.getTime() + selectingRef.current.startMinutes * 60000);
      setNewEvent({ dayKey: dayKey(base), start, end: new Date(start.getTime() + 15 * 60000) });
    }, 350);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectingRef.current) return;
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesPerPixel = 60 / HOUR_PX;
    const currentMinutes = quantizeTo15(Math.max(0, y * minutesPerPixel));

    // Если двигаем до истечения таймера — отменяем long-press и позволяем скроллить
    if (!isSelecting) {
      if (Math.abs(y - selectingRef.current.initialY) > 6) {
        if (pressTimerRef.current) {
          window.clearTimeout(pressTimerRef.current);
          pressTimerRef.current = null;
        }
        // Не начинаем выделение — пользователь скроллит
        selectingRef.current = null;
      }
      return;
    }

    // Во время активного выделения полностью гасим вертикальный скролл
    e.preventDefault();

    const { startMinutes, day } = selectingRef.current;
    const base = day;

    // Если идет ресайз ручками
    if (resizeEdgeRef.current && newEvent) {
      const currentStartM = minutesOfDay(newEvent.start);
      const currentEndM = minutesOfDay(newEvent.end);
      if (resizeEdgeRef.current === 'top') {
        const newStartM = Math.min(currentEndM - 15, Math.max(0, currentMinutes));
        const start = new Date(base.getTime() + newStartM * 60000);
        setNewEvent(prev => (prev ? { ...prev, start } : prev));
      } else if (resizeEdgeRef.current === 'bottom') {
        const newEndM = Math.max(currentStartM + 15, currentMinutes);
        const end = new Date(base.getTime() + newEndM * 60000);
        setNewEvent(prev => (prev ? { ...prev, end } : prev));
      }
      return;
    }

    // Обычное выделение прямоугольника
    const startM = Math.min(startMinutes, currentMinutes);
    const endM = Math.max(startMinutes + 15, currentMinutes);
    const start = new Date(base.getTime() + startM * 60000);
    const end = new Date(base.getTime() + endM * 60000);
    setNewEvent(prev => (prev ? { ...prev, dayKey: dayKey(base), start, end } : { dayKey: dayKey(base), start, end }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (isSelecting && newEvent) {
      setSheetOpen(true);
    }
    setIsSelecting(false);
    resizeEdgeRef.current = null;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
    selectingRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsSelecting(false);
    resizeEdgeRef.current = null;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
    selectingRef.current = null;
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelecting) {
      // Отпустили область до старта выделения — просто сброс таймера
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      selectingRef.current = null;
      return;
    }
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsSelecting(false);
    resizeEdgeRef.current = null;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
    selectingRef.current = null;
  };

  useEffect(() => {
    if (!sheetOpen) return;
    // На случай, если модалка открылась до pointerup — сбрасываем выделение
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsSelecting(false);
    selectingRef.current = null;
  }, [sheetOpen]);

  // Touch events support for Safari (non-passive with preventDefault)
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;

    const getDayEl = () => {
      const el = dayRefs.current.get(dayKey(selectedDate));
      return el || cont;
    };

    const touchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const dayEl = getDayEl();
      const rect = dayEl.getBoundingClientRect();
      const y = ev.touches[0].clientY - rect.top;
      const minutesPerPixel = 60 / HOUR_PX;
      const rawMinutes = Math.max(0, y * minutesPerPixel);
      const startMinutes = quantizeTo15(rawMinutes);
      selectingRef.current = { startMinutes, day: startOfDay(selectedDate), pointerId: 0 as any, initialY: y };
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = window.setTimeout(() => {
        if (!selectingRef.current) return;
        setIsSelecting(true);
        const base = selectingRef.current.day;
        const start = new Date(base.getTime() + selectingRef.current.startMinutes * 60000);
        setNewEvent({ dayKey: dayKey(base), start, end: new Date(start.getTime() + 15 * 60000) });
      }, 350);
    };

    const touchMove = (ev: TouchEvent) => {
      if (!selectingRef.current) return;
      const dayEl = getDayEl();
      const rect = dayEl.getBoundingClientRect();
      const y = ev.touches[0].clientY - rect.top;
      const minutesPerPixel = 60 / HOUR_PX;
      const currentMinutes = quantizeTo15(Math.max(0, y * minutesPerPixel));
      if (!isSelecting) {
        if (Math.abs(y - selectingRef.current.initialY) > 6) {
          if (pressTimerRef.current) {
            window.clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
          }
          selectingRef.current = null;
        }
        return;
      }
      // prevent page scroll during active selection on iOS Safari
      ev.preventDefault();

      const { startMinutes, day } = selectingRef.current;
      const base = day;
      if (resizeEdgeRef.current && newEvent) {
        const currentStartM = minutesOfDay(newEvent.start);
        const currentEndM = minutesOfDay(newEvent.end);
        if (resizeEdgeRef.current === 'top') {
          const newStartM = Math.min(currentEndM - 15, Math.max(0, currentMinutes));
          const start = new Date(base.getTime() + newStartM * 60000);
          setNewEvent(prev => (prev ? { ...prev, start } : prev));
        } else if (resizeEdgeRef.current === 'bottom') {
          const newEndM = Math.max(currentStartM + 15, currentMinutes);
          const end = new Date(base.getTime() + newEndM * 60000);
          setNewEvent(prev => (prev ? { ...prev, end } : prev));
        }
        return;
      }
      const startM = Math.min(startMinutes, currentMinutes);
      const endM = Math.max(startMinutes + 15, currentMinutes);
      const start = new Date(base.getTime() + startM * 60000);
      const end = new Date(base.getTime() + endM * 60000);
      setNewEvent(prev => (prev ? { ...prev, dayKey: dayKey(base), start, end } : { dayKey: dayKey(base), start, end }));
    };

    const finish = () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      if (isSelecting && newEvent) setSheetOpen(true);
      setIsSelecting(false);
      resizeEdgeRef.current = null;
      selectingRef.current = null;
    };

    const touchEnd = (_ev: TouchEvent) => finish();
    const touchCancel = (_ev: TouchEvent) => finish();

    cont.addEventListener('touchstart', touchStart, { passive: false });
    cont.addEventListener('touchmove', touchMove, { passive: false });
    cont.addEventListener('touchend', touchEnd, { passive: false });
    cont.addEventListener('touchcancel', touchCancel, { passive: false });
    return () => {
      cont.removeEventListener('touchstart', touchStart as any);
      cont.removeEventListener('touchmove', touchMove as any);
      cont.removeEventListener('touchend', touchEnd as any);
      cont.removeEventListener('touchcancel', touchCancel as any);
    };
  }, [selectedDate, isSelecting, newEvent]);

  // Swipe left/right in hours mode to change selected day
  useEffect(() => {
    if (mode !== 'hours') return;
    const cont = containerRef.current;
    if (!cont) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    const onStart = (ev: TouchEvent) => {
      if (isSelecting) return;
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    };

    const onMove = (ev: TouchEvent) => {
      if (!tracking || isSelecting) return;
      // do nothing; we decide on end
    };

    const onEnd = (_ev: TouchEvent) => {
      if (!tracking || isSelecting) { tracking = false; return; }
      const dt = Date.now() - startT;
      // Use changedTouches if needed, but we cannot reliably at end; skip
      // Read last known position from touchend? Not necessary; treat as a tap without movement → no swipe
      // We rely on TouchEvent's changedTouches for position
      try {
        const touchList = (_ev.changedTouches && _ev.changedTouches.length) ? _ev.changedTouches : (_ev.touches && _ev.touches.length ? _ev.touches : null);
        if (touchList) {
          const t = touchList[0];
          const dx = t.clientX - startX;
          const dy = t.clientY - startY;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const isHorizontal = absDx > 60 && absDx > absDy;
          const isQuick = dt < 600; // quick-ish swipe
          if (isHorizontal && isQuick) {
            const next = new Date(selectedDate);
            if (dx < 0) {
              next.setDate(next.getDate() + 1);
            } else {
              next.setDate(next.getDate() - 1);
            }
            setSelectedDate(startOfDay(next));
          }
        }
      } finally {
        tracking = false;
      }
    };

    cont.addEventListener('touchstart', onStart, { passive: true });
    cont.addEventListener('touchmove', onMove, { passive: true });
    cont.addEventListener('touchend', onEnd, { passive: true });
    cont.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      cont.removeEventListener('touchstart', onStart as any);
      cont.removeEventListener('touchmove', onMove as any);
      cont.removeEventListener('touchend', onEnd as any);
      cont.removeEventListener('touchcancel', onEnd as any);
    };
  }, [mode, selectedDate, isSelecting]);

  // Добавляем обработчик клавиатуры для навигации
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevDate = new Date(selectedDate);
        prevDate.setDate(prevDate.getDate() - 1);
        setSelectedDate(startOfDay(prevDate));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextDate = new Date(selectedDate);
        nextDate.setDate(nextDate.getDate() + 1);
        setSelectedDate(startOfDay(nextDate));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate]);

  return (
    <DefaultLayout>
      <div className="py-2 overflow-hidden">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-extrabold text-2xl md:text-4xl tracking-tight">Календарь</div>
          <div className="relative h-6 md:h-7 text-lg md:text-xl text-default-600 font-medium overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {mode === 'hours' ? (
                <motion.div
                  key={`hdr-hours-${formatDayLabel(selectedDate)}`}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {formatDayLabel(selectedDate)}
                </motion.div>
              ) : (
                <motion.div
                  key={`hdr-days-${formatMonthLabel(viewMonth)}`}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {formatMonthLabel(viewMonth)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {mode === "hours" ? (
          <motion.div key="hours"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
          <div ref={containerRef} className={`relative rounded-xl h-[calc(100vh-140px)] overflow-y-auto overflow-x-hidden overscroll-y-contain select-none ${isSelecting ? 'touch-none overflow-y-hidden' : ''}`}>
            {/* Градиент в начале для индикации скролла вверх */}
            <div className="sticky top-0 z-20 h-4 bg-gradient-to-b from-background to-transparent pointer-events-none" />
            
            <div className="relative">
              {daysList.map((day) => {
                const key = dayKey(day);
                const dayEvents = events.filter(e => dayKey(e.start) === key);
                return (
                  <div key={key} ref={(el) => { if (el) dayRefs.current.set(key, el); }} className="relative px-0 py-3">
                    <div
                      className="relative"
                      onPointerDown={(e) => handlePointerDown(e, day)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onPointerLeave={handlePointerLeave}
                    >
                      {hours.map((h) => (
                        <div key={h} className="relative flex items-start">
                          <div className="sticky left-0 z-10 w-12 shrink-0 pr-2 text-right text-[10px] text-default-500">{String(h).padStart(2, "0")}:00</div>
                          <div className="relative ml-1 h-16 flex-1 border-t border-default-200" />
                        </div>
                      ))}
                      {/* Текущая линия времени */}
                      {dayKey(day) === dayKey(now) && (
                        <div
                          className="pointer-events-none absolute left-12 right-2 z-20"
                          style={{ top: `${(minutesOfDay(now) / 60) * HOUR_PX}px` }}
                        >
                          <div className="relative">
                            <div className="absolute -left-2 top-0 h-2 w-2 rounded-full bg-black -translate-y-1/2" />
                            <div className="w-full border-t-2 border-black" />
                          </div>
                        </div>
                      )}
                      {/* render existing events */}
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="absolute left-12 right-2 rounded-md p-1 text-xs leading-tight overflow-hidden break-words"
                          style={{
                            top: `${(minutesOfDay(ev.start) / 60) * HOUR_PX}px`,
                            height: `${((minutesOfDay(ev.end) - minutesOfDay(ev.start)) / 60) * HOUR_PX}px`,
                            backgroundColor: ev.color,
                          }}
                          onClick={() => {
                            if (mode !== 'hours') return;
                            const durationHours = (minutesOfDay(ev.end) - minutesOfDay(ev.start)) / 60;
                            openTaskSheet({
                              title: ev.title,
                              deadline: startOfDay(ev.start),
                              durationHours: Math.max(0.25, durationHours),
                              kind: 'event',
                            });
                          }}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {/* selecting block */}
                      <AnimatePresence>
                        {newEvent && newEvent.dayKey === key && (
                          <motion.div
                            key="select"
                            className="absolute left-12 right-2 rounded-md bg-primary/30 border border-primary"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                              top: `${(minutesOfDay(newEvent.start) / 60) * HOUR_PX}px`,
                              height: `${((minutesOfDay(newEvent.end) - minutesOfDay(newEvent.start)) / 60) * HOUR_PX}px`,
                            }}
                          >
                            <div
                              className="absolute -left-3 -top-3 h-4 w-4 rounded-full bg-primary pointer-events-auto"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                resizeEdgeRef.current = 'top';
                                handlePointerDown(e as any, day);
                              }}
                            />
                            <div
                              className="absolute -right-3 -bottom-3 h-4 w-4 rounded-full bg-primary pointer-events-auto"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                resizeEdgeRef.current = 'bottom';
                                handlePointerDown(e as any, day);
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Градиент в конце для индикации скролла вниз */}
            <div className="sticky bottom-0 z-20 h-4 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          </div>
          </motion.div>
        ) : (
          <motion.div className="relative" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            {/* Days mode: full-screen calendar area up to bottom menu */}
            <div className="mx-auto w-[calc(100%-24px)] max-w-[calc(100vw-24px)] h-[calc(100dvh-90px)] overflow-hidden mb-0">
              <div className="h-full flex flex-col">
                {/* Weekday header */}
                <div className="grid grid-cols-7 gap-0 py-2">
                  {weekdaysShort().map((d) => (
                    <div key={d} className="text-center text-xs text-default-500">{d}</div>
                  ))}
                </div>
                {/* Month grid fills all remaining height */}
                <div className="flex-1">
                  <MonthGridV2
                    monthDate={viewMonth}
                    todayDate={startOfDay(new Date())}
                    events={events}
                    onSelectDay={(d) => { setSelectedDate(startOfDay(d)); setMode('hours'); }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Нижняя панель: анимация переключения между режимами */}
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'hours' ? (
            <motion.div
              key="bar-hours"
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-60 flex items-center gap-1 bg-white/10 backdrop-blur-2xl rounded-t-2xl px-3 py-0 h-12 w-[calc(100%-24px)] max-w-[calc(100vw-24px)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                size="sm"
                variant="flat"
                className="min-w-8 h-8 px-2"
                onClick={() => {
                  const prevDate = new Date(selectedDate);
                  prevDate.setDate(prevDate.getDate() - 1);
                  setSelectedDate(startOfDay(prevDate));
                }}
              >
                ←
              </Button>
              <Button
                size="sm"
                variant="flat"
                className="min-w-8 h-8 px-2"
                onClick={() => setSelectedDate(startOfDay(new Date()))}
                aria-label="Сегодня"
              >
                <span className="hidden sm:inline">Сегодня</span>
                <span className="inline sm:hidden">Сег.</span>
              </Button>
              <Button
                size="sm"
                variant="flat"
                className="min-w-8 h-8 px-2"
                onClick={() => {
                  const nextDate = new Date(selectedDate);
                  nextDate.setDate(nextDate.getDate() + 1);
                  setSelectedDate(startOfDay(nextDate));
                }}
              >
                →
              </Button>
              <div className="h-8 flex items-center">
                <DatePicker
                  size="sm"
                  value={selectedDateValue}
                  className="max-w-[140px]"
                  onChange={(val: any) => {
                    if (!val) return;
                    const y = val.year ?? selectedDate.getFullYear();
                    const m = (val.month ?? (selectedDate.getMonth() + 1)) - 1;
                    const d = val.day ?? selectedDate.getDate();
                    setSelectedDate(startOfDay(new Date(y, m, d)));
                  }}
                />
              </div>
              <div className="ml-auto">
                <Dropdown>
                  <DropdownTrigger>
                    <Button size="sm" variant="flat" className="h-8">{({ hours: "По часам", days: "По дням" } as const)[mode]}</Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="calendar-mode" selectedKeys={[mode]} selectionMode="single" onSelectionChange={(keys) => setMode((Array.from(keys)[0] as any) || "hours") }>
                    <DropdownItem key="hours">По часам</DropdownItem>
                    <DropdownItem key="days">По дням</DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="bar-days"
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2 bg-white/10 backdrop-blur-2xl rounded-t-2xl px-3 py-0 h-12 w-[calc(100%-24px)] max-w-[calc(100vw-24px)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex-1 overflow-x-auto no-scrollbar h-8 flex items-center" ref={monthsBarRef}>
                <div className="flex items-center gap-2 w-max px-1">
                  {renderMonthsScroller(viewMonth, (d) => { setViewMonth(d); setSelectedDate(startOfDay(new Date(d.getFullYear(), d.getMonth(), 1))); })}
                </div>
              </div>
              <div className="ml-auto">
                <Dropdown>
                  <DropdownTrigger>
                    <Button size="sm" variant="flat" className="h-8">{({ hours: "По часам", days: "По дням" } as const)[mode]}</Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="calendar-mode" selectedKeys={[mode]} selectionMode="single" onSelectionChange={(keys) => setMode((Array.from(keys)[0] as any) || "hours") }>
                    <DropdownItem key="hours">По часам</DropdownItem>
                    <DropdownItem key="days">По дням</DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div className="fixed inset-0 z-[65] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setSheetOpen(false); setNewEvent(null); }} />
            <motion.div className="fixed left-0 right-0 bottom-0 z-[70] h-[80vh] rounded-t-2xl bg-background shadow-large" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
              <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-default-300" />
              <div className="h-[calc(80vh-16px)] overflow-y-auto p-4 space-y-3">
                <div className="text-lg font-semibold">Новое событие</div>
                <div className="text-sm text-default-500">
                  {newEvent ? `${formatTime(newEvent.start)} — ${formatTime(newEvent.end)}` : null}
                </div>
                {/* Поля названия/цвета можно добавить позже */}
                <Button className="bg-black text-white" onClick={() => setSheetOpen(false)}>Сохранить</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DefaultLayout>
  );
}

function MonthGrid({ events }: { events: EventItem[] }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startDay + daysInMonth) / 7) * 7 }, (_, i) => i);
  return (
    <div className="grid grid-cols-7 gap-2">
      {cells.map((i) => {
        const dayNum = i - startDay + 1;
        const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
        const dayEvents = inMonth ? events.filter((e) => e.start.getDate() === dayNum) : [];
        return (
          <div key={i} className={`min-h-24 rounded-md border ${inMonth ? "bg-default-50" : "bg-transparent opacity-50"} p-2`}>
            <div className="text-xs text-default-500">{inMonth ? dayNum : ""}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {dayEvents.map((e) => (
                <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: e.color }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function weekdaysShort() {
  return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]; // header always starts Monday for grid consistency
}

function MonthGridV2({
  monthDate,
  todayDate,
  events,
  onSelectDay,
}: {
  monthDate: Date; // first day of month
  todayDate: Date;
  events: EventItem[];
  onSelectDay: (d: Date) => void;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // 0..6, Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Compute leading days from prev month
  const prevMonthDays = new Date(year, month, 0).getDate();
  const leading = Array.from({ length: startWeekday }, (_, i) => new Date(year, month - 1, prevMonthDays - startWeekday + i + 1));
  const current = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  const total = leading.length + current.length;
  const trailingCount = (Math.ceil(total / 7) * 7) - total;
  const trailing = Array.from({ length: trailingCount }, (_, i) => new Date(year, month + 1, i + 1));
  const allDays = [...leading, ...current, ...trailing];

  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isCurrentMonth = (d: Date) => d.getMonth() === month;

  // collect event dots per day (simple color marks)
  const dayKeyStr = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const mapColors = new Map<string, string[]>();
  for (const ev of events) {
    const k = dayKeyStr(ev.start);
    const arr = mapColors.get(k) ?? [];
    if (arr.length < 4) arr.push(ev.color);
    mapColors.set(k, arr);
  }

  const numRows = allDays.length / 7;

  return (
    <div className="h-full">
      <div className="grid grid-cols-7 grid-rows-6 gap-0 h-full">
        {allDays.map((d, idx) => {
          const inMonth = isCurrentMonth(d);
          const isToday = isSameDay(d, todayDate);
          const dots = mapColors.get(dayKeyStr(d)) ?? [];
          const col = idx % 7;
          const row = Math.floor(idx / 7);
          return (
            <button
              key={`${d.toISOString()}-${idx}`}
              onClick={() => onSelectDay(d)}
              className={`h-full w-full p-1 ${inMonth ? '' : 'opacity-50'} hover:bg-default-50/50 transition-colors flex flex-col ${col < 6 ? 'border-r' : ''} ${row < (numRows - 1) ? 'border-b' : ''} border-default-200`}
            >
              <div className="w-full flex justify-center text-xs">
                <span className={`${isToday ? 'inline-grid place-items-center h-6 w-6 rounded-full bg-black text-white' : ''}`}>{d.getDate()}</span>
              </div>
              <div className="mt-auto w-full flex gap-1 flex-wrap items-center justify-center">
                {dots.map((c, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function renderMonthsScroller(anchorMonth: Date, onPick: (d: Date) => void) {
  // Build a horizontal list of months around anchor year, with year dividers
  const months = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  const year = anchorMonth.getFullYear();
  const make = (y: number, m: number) => {
    const d = new Date(y, m, 1);
    d.setHours(0,0,0,0);
    return d;
  };
  const items: Array<{ type: 'year'|'month'; key: string; label: string; date?: Date }>=[];
  // previous year
  items.push({ type: 'year', key: `y-${year-1}`, label: String(year-1) });
  for (let m=0;m<12;m++) items.push({ type: 'month', key: `m-${year-1}-${m}`, label: months[m], date: make(year-1,m) });
  // current year
  items.push({ type: 'year', key: `y-${year}`, label: String(year) });
  for (let m=0;m<12;m++) items.push({ type: 'month', key: `m-${year}-${m}`, label: months[m], date: make(year,m) });
  // next year
  items.push({ type: 'year', key: `y-${year+1}`, label: String(year+1) });
  for (let m=0;m<12;m++) items.push({ type: 'month', key: `m-${year+1}-${m}`, label: months[m], date: make(year+1,m) });

  const selYear = anchorMonth.getFullYear();
  const selMonth = anchorMonth.getMonth();

  return items.map((it) => {
    if (it.type === 'year') {
      return (
        <div key={it.key} className="px-2 text-xs text-default-500 select-none">{it.label}</div>
      );
    }
    const isSelected = it.date!.getFullYear()===selYear && it.date!.getMonth()===selMonth;
    return (
      <button
        key={it.key}
        data-key={it.key}
        className={`px-2 py-1 text-xs rounded-md ${isSelected ? 'bg-black text-white' : 'bg-white/10'}`}
        onClick={() => onPick!(it.date!)}
      >
        {it.label}
      </button>
    );
  });
}

function formatTime(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayKey(d: Date) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}
function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}
function formatDayLabel(d: Date) {
  const wd = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][d.getDay()];
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]; 
  return `${wd}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatMonthLabel(d: Date) {
  const months = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}


