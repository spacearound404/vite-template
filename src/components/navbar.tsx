import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGroup, motion } from "framer-motion";
import { useTaskSheet } from "@/provider";
import { BiHomeAlt2 } from "react-icons/bi";
import { PiTagSimpleBold } from "react-icons/pi";
import { FaPlus } from "react-icons/fa";
import { MdOutlineCalendarViewMonth } from "react-icons/md";
import { TbSettings2 } from "react-icons/tb";

const MaterialHomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
);

const MaterialLabelIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
    <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5H5C3.9 5 3 5.9 3 7v10c0 1.1.9 2 2 2h11c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
  </svg>
);

const MaterialAddIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

const MaterialCalendarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
  </svg>
);

const MaterialSettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>
    <path d="M19.14 12.94a1.43 1.43 0 000-1.88l1.43-1.12a.5.5 0 00.12-.64l-1.71-2.96a.5.5 0 00-.6-.22l-1.69.68a6.7 6.7 0 00-1.6-.93l-.26-1.8a.5.5 0 00-.5-.43h-3.4a.5.5 0 00-.5.43l-.26 1.8a6.7 6.7 0 00-1.6.93l-1.69-.68a.5.5 0 00-.6.22L3.31 9.3a.5.5 0 00.12.64l1.43 1.12a4.5 4.5 0 000 1.88L3.43 14.06a.5.5 0 00-.12.64l1.71 2.96a.5.5 0 00.6.22l1.69-.68c.5.38 1.04.69 1.6.93l.26 1.8a.5.5 0 00.5.43h3.4a.5.5 0 00.5-.43l.26-1.8c.56-.24 1.1-.55 1.6-.93l1.69.68a.5.5 0 00.6-.22l1.71-2.96a.5.5 0 00-.12-.64l-1.43-1.12zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z" />
  </svg>
);

const HomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    height="24"
    width="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" fill="currentColor"/>
  </svg>
);

const TagIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    height="24"
    width="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path d="M2 12.5V5a1 1 0 0 1 1-1h7.5a2 2 0 0 1 1.41.59l8.5 8.5a2 2 0 0 1 0 2.83l-4.59 4.59a2 2 0 0 1-2.83 0l-8.5-8.5A2 2 0 0 1 2 12.5Z" fill="currentColor"/>
    <circle cx="7.5" cy="7.5" r="1.5" fill="#000" opacity=".25"/>
  </svg>
);

const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    height="24"
    width="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const CalendarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    height="24"
    width="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <rect x="3" y="4" width="18" height="17" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M3 9h18" stroke="currentColor" strokeWidth="2"/>
    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const SettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    height="24"
    width="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" stroke="currentColor" strokeWidth="2"/>
    <path d="M19.4 15a1 1 0 0 0 .2 1.09l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1 1 0 0 0-1.09-.2 1 1 0 0 0-.6.55 2 2 0 0 1-3.66 0 1 1 0 0 0-.6-.55 1 1 0 0 0-1.09.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1 1 0 0 0 .2-1.09 1 1 0 0 0-.55-.6 2 2 0 0 1 0-3.66 1 1 0 0 0 .55-.6 1 1 0 0 0-.2-1.09l-.06-.06A2 2 0 1 1 6.77 5.2l.06.06a1 1 0 0 0 1.09.2 1 1 0 0 0 .6-.55 2 2 0 0 1 3.66 0 1 1 0 0 0 .6.55 1 1 0 0 0 1.09-.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1 1 0 0 0-.2 1.09 1 1 0 0 0 .55.6 2 2 0 0 1 0 3.66 1 1 0 0 0-.55.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openTaskSheet } = useTaskSheet();
  const navRef = useRef<HTMLDivElement | null>(null);
  

  const pathToKey = useMemo<Record<string, string>>(
    () => ({
      "/main": "main",
      "/tags": "tags",
      "/days": "days",
      "/opt": "opt",
    }),
    [],
  );

  const keyToPath = useMemo<Record<string, string>>(
    () => ({
      main: "/main",
      tags: "/tags",
      days: "/days",
      opt: "/opt",
    }),
    [],
  );

  const order = useMemo(() => ["main", "tags", "add", "days", "opt"], []);
  const routeKey = pathToKey[location.pathname] ?? "main";
  const [currentKey, setCurrentKey] = useState<string>(routeKey);

  useEffect(() => {
    // sync with route (e.g., back/forward nav)
    setCurrentKey(routeKey);
  }, [routeKey]);

  // indicator handled by Framer Motion shared layout; no manual measurements

  const handleChange = useCallback(
    (key: React.Key) => {
      if (key === "add") {
        openTaskSheet();
        return;
      }
      const k = String(key);
      setCurrentKey(k);
      const next = keyToPath[k];
      if (next) navigate(next);
    },
    [keyToPath, navigate, openTaskSheet],
  );

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const rect = nav.getBoundingClientRect();
      const viewportGap = Math.max(0, window.innerHeight - rect.bottom);
      const height = nav.offsetHeight + viewportGap;
      document.documentElement.style.setProperty("--bottom-nav-height", `${height}px`);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro) ro.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <nav ref={navRef} className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-white/10 backdrop-blur-2xl shadow-lg w-[calc(100%-24px)] max-w-[calc(100vw-24px)] ${currentKey === 'days' ? 'rounded-b-2xl' : 'rounded-2xl'}`}>
        <div className="w-full py-2">
          <LayoutGroup id="bottom-navbar">
            <div className="relative grid grid-cols-5 items-center gap-4 px-4 py-3">
              {order.map((k) => {
                const isActive = currentKey === k;
                const onClick = () => handleChange(k);
                const Icon = k === "main" ? BiHomeAlt2 : k === "tags" ? PiTagSimpleBold : k === "add" ? FaPlus : k === "days" ? MdOutlineCalendarViewMonth : TbSettings2;
                return (
                  <div key={k} className="relative grid place-items-center">
                    <div className="relative h-10 w-10">
                      {isActive && (
                        <motion.div
                          layoutId="nav-cursor"
                          initial={false}
                          className="absolute inset-0 m-1 rounded-md bg-black !opacity-100"
                          transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
                        />
                      )}
                      <button
                        className={`relative z-10 grid h-full w-full place-items-center rounded-md transition-colors duration-200 ${isActive ? 'hover:bg-transparent' : 'hover:bg-default-100'}`}
                        onClick={onClick}
                      >
                        <Icon className={isActive ? "text-white" : "text-foreground"} size={k === "add" ? 24 : 20} />
                        {k === "days" && <CalendarBadge />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
      </nav>

      {/* Global task sheet is handled in Provider */}
    </>
  );
};

function CalendarBadge() {
  const { todayEventsCount } = useTaskSheet();
  if (!todayEventsCount) return null;
  return (
    <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] text-white">
      {todayEventsCount}
    </span>
  );
}
