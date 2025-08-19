import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DatePicker } from "@heroui/react";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { parseDate, getLocalTimeZone, today } from "@internationalized/date";
import DefaultLayout from "@/layouts/default";
import { useTaskSheet } from "@/provider";
import { getEventsCached, createEvent, getProjectsCached, getTasksCached, getMySettingsCached, getEvents } from "@/lib/api";

type EventItem = { id: string; title: string; start: Date; end: Date; projectId: number | null };
type DayInfo = { tasksCount: number; capacityPct: number };

export default function DaysPage() {
  const { openTaskSheet, setTodayEventsCount } = useTaskSheet();
  const [mode, setMode] = useState<"hours" | "days">("hours");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [dailyInfo, setDailyInfo] = useState<Record<string, DayInfo>>({});
  const [loading, setLoading] = useState(false);
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
  const [projectColors, setProjectColors] = useState<Record<number, string>>({});

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
  const [hasHiddenEventsTop, setHasHiddenEventsTop] = useState(false);
  const [hasHiddenEventsBottom, setHasHiddenEventsBottom] = useState(false);
  const [hiddenTopCount, setHiddenTopCount] = useState(0);
  const [hiddenBottomCount, setHiddenBottomCount] = useState(0);

  const daysList = useMemo(() => [selectedDate], [selectedDate]);

  // Конвертируем Date в формат для DatePicker
  const selectedDateValue = useMemo(() => {
    return parseDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`);
  }, [selectedDate]);

  // Load project colors
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projs = await getProjectsCached();
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const p of projs) map[p.id] = (p as any).color as string;
        setProjectColors(map);
      } catch {}
    })();
    const onProjChanged = async () => {
      try {
        const projs = await getProjectsCached();
        const map: Record<number, string> = {};
        for (const p of projs) map[p.id] = (p as any).color as string;
        setProjectColors(map);
      } catch {}
    };
    window.addEventListener('projects:changed', onProjChanged as any);
    return () => { cancelled = true; window.removeEventListener('projects:changed', onProjChanged as any); };
  }, []);

  const colorFor = (pid: number | null | undefined) => (pid != null && projectColors[pid] ? projectColors[pid] : '#BFDBFE');

  useEffect(() => {
    let cancelled = false;
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    const overlapHours = (startIso?: string | null, endIso?: string | null, day: Date = new Date()): number => {
      if (!startIso || !endIso) return 0;
      const s = new Date(startIso).getTime();
      const e = new Date(endIso).getTime();
      const dayStart = startOfDay(day).getTime();
      const dayEnd = endOfDay(day).getTime();
      const start = Math.max(s, dayStart);
      const end = Math.min(e, dayEnd);
      const ms = Math.max(0, end - start);
      return ms / (1000 * 60 * 60);
    };

    const weekdayCapacity = (settings: any, d: Date) => {
      const wd = d.getDay();
      switch (wd) {
        case 0: return settings.hours_sun ?? 0;
        case 1: return settings.hours_mon ?? 0;
        case 2: return settings.hours_tue ?? 0;
        case 3: return settings.hours_wed ?? 0;
        case 4: return settings.hours_thu ?? 0;
        case 5: return settings.hours_fri ?? 0;
        case 6: return settings.hours_sat ?? 0;
        default: return 0;
      }
    };

    const reload = async () => {
      try {
        setLoading(true);
        // Month range
        const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
        const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
        const [eventsList, tasksList, settings] = await Promise.all([
          getEventsCached({ start: monthStart.toISOString(), end: monthEnd.toISOString() }),
          getTasksCached(),
          getMySettingsCached(),
        ]);
        if (cancelled) return;
        const mappedEvents: EventItem[] = eventsList.map(e => ({ id: String((e as any).id), title: (e as any).title, start: new Date((e as any).event_start!), end: new Date((e as any).event_end!), projectId: (e as any).project_id ?? null }));
        setEvents(mappedEvents);

        // Build daily info for all days shown in MonthGridV2 later (we cover current month days here)
        const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
        const info: Record<string, DayInfo> = {};
        const tasksOnly = (tasksList as any[]).filter(t => (t.kind ?? 'task') === 'task');
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
          const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const dayTasks = tasksOnly.filter(t => (t.deadline ?? '').startsWith(dayStr));
          const tasksCount = dayTasks.length;
          const usedTaskHours = dayTasks.reduce((sum, t) => sum + (t.duration_hours ?? 0), 0);
          const usedEventHours = mappedEvents.reduce((sum, ev) => sum + overlapHours((ev as any).start?.toISOString?.() ? (ev as any).start.toISOString() : (ev as any).event_start, (ev as any).end?.toISOString?.() ? (ev as any).end.toISOString() : (ev as any).event_end, d), 0);
          const limit = weekdayCapacity(settings, d);
          const pct = limit > 0 ? Math.min(100, Math.max(0, (usedTaskHours + usedEventHours) / limit * 100)) : 0;
          info[key] = { tasksCount, capacityPct: pct };
        }
        setDailyInfo(info);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    reload();

    const onDataChanged = () => reload();
    window.addEventListener('tasks:changed', onDataChanged as any);
    window.addEventListener('projects:changed', onDataChanged as any);
    return () => { cancelled = true; window.removeEventListener('tasks:changed', onDataChanged as any); window.removeEventListener('projects:changed', onDataChanged as any); };
  }, [viewMonth]);

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

  // When selected day changes in hours mode, allow auto-scroll to nearest event again
  useEffect(() => {
    if (mode === 'hours') {
      hasAutoScrolledRef.current = false;
    }
  }, [selectedDate, mode]);

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

  // Индикаторы: показываем стрелку сверху, если есть события выше; снизу — если есть события ниже
  useEffect(() => {
    if (mode !== 'hours') { setHasHiddenEventsTop(false); setHasHiddenEventsBottom(false); setHiddenTopCount(0); setHiddenBottomCount(0); return; }
    const cont = containerRef.current;
    if (!cont) return;

    const compute = () => {
      const selKey = dayKey(selectedDate);
      const dayEl = dayRefs.current.get(selKey);
      if (!dayEl) { setHasHiddenEventsTop(false); setHasHiddenEventsBottom(false); setHiddenTopCount(0); setHiddenBottomCount(0); return; }
      const dayEvents = events.filter(e => dayKey(e.start) === selKey);
      if (dayEvents.length === 0) { setHasHiddenEventsTop(false); setHasHiddenEventsBottom(false); setHiddenTopCount(0); setHiddenBottomCount(0); return; }

      const toPx = (minutes: number) => (minutes / 60) * HOUR_PX;
      const topBoundary = cont.scrollTop;
      const bottomBoundary = cont.scrollTop + cont.clientHeight;
      let above = 0;
      let below = 0;
      for (const ev of dayEvents) {
        const evStart = dayEl.offsetTop + toPx(minutesOfDay(ev.start));
        const evEnd = dayEl.offsetTop + toPx(minutesOfDay(ev.end));
        if (evEnd < topBoundary - 1) above++;
        if (evStart > bottomBoundary + 1) below++;
      }
      setHasHiddenEventsTop(above > 0);
      setHasHiddenEventsBottom(below > 0);
      setHiddenTopCount(above);
      setHiddenBottomCount(below);
    };

    compute();
    const onScroll = () => compute();
    const onResize = () => compute();
    cont.addEventListener('scroll', onScroll, { passive: true } as any);
    window.addEventListener('resize', onResize);
    return () => {
      cont.removeEventListener('scroll', onScroll as any);
      window.removeEventListener('resize', onResize);
    };
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
            hasAutoScrolledRef.current = false;
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

  const scrollToEvent = (direction: 'up' | 'down') => {
    const cont = containerRef.current;
    if (!cont) return;
    const selKey = dayKey(selectedDate);
    const dayEl = dayRefs.current.get(selKey);
    if (!dayEl) return;
    const toPx = (minutes: number) => (minutes / 60) * HOUR_PX;
    const dayEvents = events
      .filter((e) => dayKey(e.start) === selKey)
      .sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start));
    if (dayEvents.length === 0) return;
    const topBoundary = cont.scrollTop;
    const bottomBoundary = cont.scrollTop + cont.clientHeight;
    if (direction === 'down') {
      const next = dayEvents.find((ev) => dayEl.offsetTop + toPx(minutesOfDay(ev.start)) > bottomBoundary + 1);
      if (!next) return;
      const targetTop = dayEl.offsetTop + toPx(minutesOfDay(next.start));
      const pad = Math.round(cont.clientHeight * 0.2);
      cont.scrollTo({ top: Math.max(0, targetTop - pad), behavior: 'smooth' });
    } else {
      const prevs = dayEvents.filter((ev) => dayEl.offsetTop + toPx(minutesOfDay(ev.end)) < topBoundary - 1);
      const prev = prevs.length ? prevs[prevs.length - 1] : null;
      if (!prev) return;
      const targetTop = dayEl.offsetTop + toPx(minutesOfDay(prev.start));
      const pad = Math.round(cont.clientHeight * 0.2);
      cont.scrollTo({ top: Math.max(0, targetTop - pad), behavior: 'smooth' });
    }
  };

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
          <div
            ref={containerRef}
            className={`relative rounded-xl overflow-y-auto overflow-x-hidden overscroll-y-contain select-none ${isSelecting ? 'touch-none overflow-y-hidden' : ''}`}
            style={{ height: 'calc(100dvh - var(--bottom-nav-height, 96px) - 90px)' }}
          >
            {hasHiddenEventsTop && (
              <div className="sticky top-2 z-[70] flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={() => scrollToEvent('up')}
                  className="pointer-events-auto inline-flex items-center justify-center gap-2 h-9 px-3 rounded-full bg-default-200 text-default-700 shadow-sm"
                  aria-label="Прокрутить к предыдущему событию"
                >
                  <span className="text-sm leading-none">↑</span>
                  <span className="text-sm leading-none font-semibold">{hiddenTopCount}</span>
                </button>
              </div>
            )}
            {/* Градиент в начале для индикации скролла вверх */}
            <div className="sticky top-0 z-20 h-4 bg-gradient-to-b from-background to-transparent pointer-events-none" />
            
            <div className="relative">
              {daysList.map((day) => {
                const key = dayKey(day);
                const dayEvents = events.filter(e => dayKey(e.start) === key).sort((a, b) => a.start.getTime() - b.start.getTime());
                // Assign columns to overlapping events
                type Placed = EventItem & { __col: number };
                const placed: Placed[] = [];
                const colEndTimes: number[] = [];
                for (const ev of dayEvents) {
                  let assigned = -1;
                  for (let c = 0; c < colEndTimes.length; c++) {
                    if (colEndTimes[c] <= ev.start.getTime()) { assigned = c; break; }
                  }
                  if (assigned === -1) { assigned = colEndTimes.length; colEndTimes.push(ev.end.getTime()); } else { colEndTimes[assigned] = ev.end.getTime(); }
                  placed.push({ ...ev, __col: assigned });
                }
                const totalCols = Math.max(1, ...placed.map(p => p.__col + 1));
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
                      {/* render existing events side-by-side */}
                      {placed.map((ev) => (
                        <div
                          key={ev.id}
                          className="absolute rounded-md p-1 text-xs leading-tight overflow-hidden break-words border border-default bg-background pl-2"
                          style={{
                            top: `${(minutesOfDay(ev.start) / 60) * HOUR_PX}px`,
                            height: `${((minutesOfDay(ev.end) - minutesOfDay(ev.start)) / 60) * HOUR_PX}px`,
                            borderLeft: `4px solid ${colorFor(ev.projectId)}`,
                            left: `calc(3rem + (${ev.__col} * (100% - 3rem - 0.5rem) / ${totalCols}))`,
                            width: `calc((100% - 3rem - 0.5rem) / ${totalCols} - 2px)`,
                          }}
                          onClick={() => {
                            if (mode !== 'hours') return;
                            openTaskSheet({
                              id: Number(ev.id),
                              kind: 'event',
                              title: ev.title,
                              eventStart: new Date(ev.start),
                              eventEnd: new Date(ev.end),
                              eventStartTime: `${String(ev.start.getHours()).padStart(2,'0')}:${String(ev.start.getMinutes()).padStart(2,'0')}`,
                              eventEndTime: `${String(ev.end.getHours()).padStart(2,'0')}:${String(ev.end.getMinutes()).padStart(2,'0')}`,
                              projectId: ev.projectId ?? null,
                            } as any);
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
            {hasHiddenEventsBottom && (
              <>
                <button
                  type="button"
                  onClick={() => scrollToEvent('down')}
                  className="fixed left-1/2 z-[70] -translate-x-1/2 inline-flex items-center justify-center gap-2 h-9 px-3 rounded-full bg-default-200 text-default-700 shadow-sm"
                  style={{ bottom: 'calc(5rem + 3rem + 10px)' }}
                  aria-label="Прокрутить к следующему событию"
                >
                  <span className="text-sm leading-none">↓</span>
                  <span className="text-sm leading-none font-semibold">{hiddenBottomCount}</span>
                </button>
              </>
            )}
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
                    projectColors={projectColors}
                    dailyInfo={dailyInfo}
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
                  <DropdownMenu classNames={{ base: "border-none", list: "border-none" }} aria-label="calendar-mode" selectedKeys={[mode]} selectionMode="single" onSelectionChange={(keys) => setMode((Array.from(keys)[0] as any) || "hours") }>
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
                  <DropdownMenu classNames={{ base: "border-none", list: "border-none" }} aria-label="calendar-mode" selectedKeys={[mode]} selectionMode="single" onSelectionChange={(keys) => setMode((Array.from(keys)[0] as any) || "hours") }>
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
            <motion.div className="fixed left-0 right-0 bottom-0 z-[70] h-[88vh] max-h-[88vh] rounded-t-2xl bg-background shadow-large" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
              <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-default-300" />
              <div className="h-[calc(80vh-16px)] overflow-y-auto p-4 space-y-3">
                <div className="text-lg font-semibold">Новое событие</div>
                <div className="text-sm text-default-500">
                  {newEvent ? `${formatTime(newEvent.start)} — ${formatTime(newEvent.end)}` : null}
                </div>
                {/* Поля названия/цвета можно добавить позже */}
                <Button className="bg-black text-white" onClick={async () => {
                  if (!newEvent) { setSheetOpen(false); return; }
                  const saved = await createEvent({ title: "Событие", kind: "event", event_start: newEvent.start.toISOString(), event_end: newEvent.end.toISOString() });
                  // уведомим главную страницу для пересчета capacity
                  try { window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "created", task: saved } })); } catch {}
                  setSheetOpen(false);
                  setNewEvent(null);
                  // reload current month
                  const startISO = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).toISOString();
                  const endISO = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1).toISOString();
                  const list = await getEvents({ start: startISO, end: endISO });
                  setEvents(list.map(e => ({ id: String(e.id), title: e.title, start: new Date((e as any).event_start!), end: new Date((e as any).event_end!), projectId: (e as any).project_id ?? null })));
                }}>Сохранить</Button>
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
                <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#BFDBFE' }} />
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
  projectColors,
  dailyInfo,
  onSelectDay,
}: {
  monthDate: Date; // first day of month
  todayDate: Date;
  events: EventItem[];
  projectColors: Record<number, string>;
  dailyInfo: Record<string, DayInfo>;
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
    const color = ev.projectId != null && projectColors[ev.projectId] ? projectColors[ev.projectId] : '#BFDBFE';
    if (arr.length < 4) arr.push(color);
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
              <div className="mt-auto w-full flex flex-col items-center justify-center pb-1">
                {(() => {
                  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                  const info = dailyInfo[key];
                  const tasksCount = info?.tasksCount ?? 0;
                  const pct = info?.capacityPct ?? 0;
                  return (
                    <>
                      <span className="text-[10px] leading-tight text-default-500">{tasksCount} задач</span>
                      <span className="text-[10px] leading-tight font-semibold" style={{ color: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#6b7280' }}>{Math.round(pct)}%</span>
                    </>
                  );
                })()}
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


