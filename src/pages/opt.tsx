import { useEffect, useMemo, useState } from "react";
import DefaultLayout from "@/layouts/default";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { getMySettingsCached, updateMySettings, UserSettings, getProjectsCached, deleteProject, Project } from "@/lib/api";

type ModelKey = "gpt-5" | "gpt-5-thinking" | "gpt-4o";

export default function OptPage() {
  const [selectedModel, setSelectedModel] = useState<ModelKey>("gpt-5");
  const [apiToken, setApiToken] = useState<string>("");

  const weekdays = useMemo(
    () => [
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
      "Воскресенье",
    ],
    []
  );

  const [hoursByDay, setHoursByDay] = useState<number[]>(() => Array.from({ length: 7 }, () => 9));
  const [loading, setLoading] = useState(false);
  const hourOptions = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []); // 0..24

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const modelLabel: Record<ModelKey, string> = {
    "gpt-5": "GPT-5",
    "gpt-5-thinking": "GPT-5 Thinking",
    "gpt-4o": "GPT-4o",
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const s = await getMySettingsCached();
        if (cancelled) return;
        setHoursByDay([
          s.hours_mon,
          s.hours_tue,
          s.hours_wed,
          s.hours_thu,
          s.hours_fri,
          s.hours_sat,
          s.hours_sun,
        ]);
        const projs = await getProjectsCached();
        if (!cancelled) {
          setProjects(projs);
          setSelectedProjectId(projs.length ? projs[0].id : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <DefaultLayout>
      <div className="py-2 flex-1 min-h-0 overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-extrabold text-2xl md:text-4xl tracking-tight">Настройки</div>
          {loading && <span className="text-xs text-default-500">Загрузка…</span>}
        </div>

        <div className="space-y-8">
          {/* Выбор модели */}
          <section className="space-y-2">
            <div className="text-lg font-semibold">Выбор модели</div>
            <div>
              <Dropdown classNames={{ content: "!border-0 !border-transparent" }}>
                <DropdownTrigger>
                  <Button variant="flat" className="h-10">
                    {modelLabel[selectedModel]}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  classNames={{ base: "border-none", list: "border-none divide-y-0" }}
                  aria-label="model-select"
                  selectedKeys={[selectedModel]}
                  selectionMode="single"
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0] as ModelKey | undefined;
                    if (k) setSelectedModel(k);
                  }}
                >
                  <DropdownItem key="gpt-5">GPT-5</DropdownItem>
                  <DropdownItem key="gpt-5-thinking">GPT-5 Thinking</DropdownItem>
                  <DropdownItem key="gpt-4o">GPT-4o</DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </section>

          {/* API Token */}
          <section className="space-y-2">
            <div className="text-lg font-semibold">API Token</div>
            <Input
              type="password"
              label="API Token"
              placeholder="Введите API Token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="max-w-xl"
            />
          </section>

          {/* Дни недели + часы */}
          <section className="space-y-2">
            <div className="text-lg font-semibold">Capacity</div>
            <div className="space-y-2">
              {weekdays.map((dayLabel, idx) => (
                <div key={dayLabel} className="flex items-center justify-between gap-3">
                  <div className="text-sm text-default-600 w-40">{dayLabel}</div>
                  <div>
                    <Dropdown classNames={{ content: "!border-0 !border-transparent" }}>
                      <DropdownTrigger>
                        <Button variant="flat" className="h-9 min-w-24">
                          {String(hoursByDay[idx]).padStart(2, "0")}:00
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        classNames={{ base: "!border-0 !border-transparent", list: "divide-y-0" }}
                        aria-label={`hours-${idx}`}
                        className="max-h-60 overflow-y-auto"
                        selectedKeys={[String(hoursByDay[idx])]} // expects string keys
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const key = Array.from(keys)[0] as string | undefined;
                          if (!key) return;
                          const hour = Number(key);
                          setHoursByDay((prev) => {
                            const next = prev.slice();
                            next[idx] = hour;
                            return next;
                          });
                        }}
                      >
                        {hourOptions.map((h) => (
                          <DropdownItem key={String(h)}>{h}</DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </div>
              ))}
              <div>
                <Button className="bg-black text-white" onClick={async () => {
                  setLoading(true);
                  try {
                    const data: Partial<UserSettings> = {
                      hours_mon: hoursByDay[0],
                      hours_tue: hoursByDay[1],
                      hours_wed: hoursByDay[2],
                      hours_thu: hoursByDay[3],
                      hours_fri: hoursByDay[4],
                      hours_sat: hoursByDay[5],
                      hours_sun: hoursByDay[6],
                    } as any;
                    await updateMySettings(data);
                  } finally {
                    setLoading(false);
                  }
                }}>Сохранить Capacity</Button>
              </div>
            </div>
          </section>

          {/* Удалить проект */}
          <section className="space-y-2">
            <div className="text-lg font-semibold">Удалить проект</div>
            <div className="flex items-center gap-3 flex-wrap">
              <Dropdown classNames={{ content: "!border-0 !border-transparent" }}>
                <DropdownTrigger>
                  <Button variant="flat" className="h-10 min-w-32">
                    {selectedProjectId != null ? (projects.find(p => p.id === selectedProjectId)?.name ?? "Проект") : "Выберите проект"}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  classNames={{ base: "!border-0 !border-transparent", list: "divide-y-0" }}
                  aria-label="projects-select"
                  selectedKeys={selectedProjectId != null ? [String(selectedProjectId)] : []}
                  selectionMode="single"
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0] as string | undefined;
                    setSelectedProjectId(k ? Number(k) : null);
                  }}
                >
                  {projects.map((p) => (
                    <DropdownItem key={String(p.id)}>{p.name}</DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
              <Button
                color="danger"
                className="h-10"
                onClick={() => {
                  if (selectedProjectId == null) return;
                  const proj = projects.find(p => p.id === selectedProjectId);
                  if (!proj) return;
                  const ok = window.confirm(`Удалить проект "${proj.name}" и все связанные задачи?`);
                  if (!ok) return;
                  (async () => {
                    try {
                      await deleteProject(selectedProjectId);
                      // remove locally
                      setProjects((prev) => prev.filter((p) => p.id !== selectedProjectId));
                      setSelectedProjectId((prev) => {
                        const rest = projects.filter((p) => p.id !== prev);
                        return rest.length ? rest[0].id : null;
                      });
                      // notify other views (e.g., main capacity and tasks lists)
                      window.dispatchEvent(new CustomEvent("projects:changed", { detail: { type: "deleted", id: selectedProjectId } }));
                      window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "bulk-deleted", project_id: selectedProjectId } }));
                    } catch (e) {
                      // noop
                    }
                  })();
                }}
              >
                Удалить
              </Button>
            </div>
          </section>
        </div>
      </div>
    </DefaultLayout>
  );
}


