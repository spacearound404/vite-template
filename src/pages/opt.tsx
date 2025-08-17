import { useMemo, useState } from "react";
import DefaultLayout from "@/layouts/default";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";

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
  const hourOptions = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []); // 0..24

  const [projects, setProjects] = useState<string[]>(["Проект 1", "Проект 2", "Проект 3"]);
  const [selectedProject, setSelectedProject] = useState<string | null>(projects[0] ?? null);

  const modelLabel: Record<ModelKey, string> = {
    "gpt-5": "GPT-5",
    "gpt-5-thinking": "GPT-5 Thinking",
    "gpt-4o": "GPT-4o",
  };

  return (
    <DefaultLayout>
      <div className="py-2 flex-1 min-h-0 overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-extrabold text-2xl md:text-4xl tracking-tight">Настройки</div>
        </div>

        <div className="space-y-8">
          {/* Выбор модели */}
          <section className="space-y-2">
            <div className="text-lg font-semibold">Выбор модели</div>
            <div>
              <Dropdown>
                <DropdownTrigger>
                  <Button variant="flat" className="h-10">
                    {modelLabel[selectedModel]}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
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
                    <Dropdown>
                      <DropdownTrigger>
                        <Button variant="flat" className="h-9 min-w-24">
                          {String(hoursByDay[idx]).padStart(2, "0")}:00
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
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
            </div>
          </section>

          {/* Удалить проект */}
          <section className="space-y-2">
            <div className="text-lg font-semibold">Удалить проект</div>
            <div className="flex items-center gap-3 flex-wrap">
              <Dropdown>
                <DropdownTrigger>
                  <Button variant="flat" className="h-10 min-w-32">
                    {selectedProject ?? "Выберите проект"}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="projects-select"
                  selectedKeys={selectedProject ? [selectedProject] : []}
                  selectionMode="single"
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0] as string | undefined;
                    if (k) setSelectedProject(k);
                  }}
                >
                  {projects.map((p) => (
                    <DropdownItem key={p}>{p}</DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
              <Button
                color="danger"
                className="h-10"
                onClick={() => {
                  if (!selectedProject) return;
                  if (!projects.includes(selectedProject)) return;
                  const ok = window.confirm(`Удалить проект "${selectedProject}"?`);
                  if (!ok) return;
                  setProjects((prev) => prev.filter((p) => p !== selectedProject));
                  setSelectedProject((prev) => {
                    const rest = projects.filter((p) => p !== prev);
                    return rest[0] ?? null;
                  });
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


