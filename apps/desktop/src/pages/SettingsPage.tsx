import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSearch,
  Fingerprint,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  KeyRound,
  LockKeyhole,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  ScanLine,
  Shield,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../lib/context";
import type { TranslationKey } from "../lib/i18n";
import { errorMessage, formatNumber } from "../lib/format";
import type { AppSettings, Language, ScheduleSettings } from "../lib/types";
import { cn } from "../lib/ui";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { PageHeader, SectionCard } from "../components/PageHeader";
import { Toggle } from "../components/Toggle";

type SettingsTab = "general" | "protection" | "scan" | "vt" | "about";

const tabs: Array<{ id: SettingsTab; label: TranslationKey; icon: LucideIcon }> = [
  { id: "general", label: "settings.tabsGeneral", icon: SlidersHorizontal },
  { id: "protection", label: "settings.tabsProtection", icon: Shield },
  { id: "scan", label: "settings.tabsScanning", icon: ScanLine },
  { id: "vt", label: "settings.tabsVt", icon: KeyRound },
  { id: "about", label: "settings.tabsAbout", icon: Info },
];

const themeSwatches: Record<string, string[]> = {
  dark: ["#0b1420", "#16243a", "#2a3d57"],
  light: ["#f4f7fb", "#ffffff", "#dbe4f0"],
  system: ["#0b1420", "#7c90aa", "#f4f7fb"],
};

export function SettingsPage() {
  const {
    data,
    settings,
    t,
    lang,
    saveSettings,
    savePending,
    confirm,
    toast,
    retryRealtime,
    openDataDir,
  } = useApp();

  const [tab, setTab] = useState<SettingsTab>("general");
  const [draft, setDraft] = useState<AppSettings>(() => settings);
  const [nicknameError, setNicknameError] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const savedRef = useRef(JSON.stringify(settings));

  useEffect(() => {
    const json = JSON.stringify(settings);
    if (json !== savedRef.current) {
      savedRef.current = json;
      setDraft(settings);
      setNicknameError(false);
    }
  }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const active = settings.realtimeEnabled && data.realtimeActive;

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const updateSchedule = (patch: Partial<ScheduleSettings>) => {
    setDraft((previous) => ({
      ...previous,
      scheduledScan: { ...previous.scheduledScan, ...patch },
    }));
  };

  const addFolderTo = async (key: "watchedDirs" | "exclusions") => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("settings.addFolder"),
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path !== "string" || !path) return;
      const current = draft[key];
      if (current.some((entry) => entry.toLowerCase() === path.toLowerCase())) return;
      update(key, [...current, path]);
      toast("success", t("toasts.folderAdded"));
    } catch (error) {
      toast("error", errorMessage(error));
    }
  };

  const addFileToExclusions = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: t("settings.addFile"),
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path !== "string" || !path) return;
      if (draft.exclusions.some((entry) => entry.toLowerCase() === path.toLowerCase())) {
        return;
      }
      update("exclusions", [...draft.exclusions, path]);
      toast("success", t("toasts.fileAdded"));
    } catch (error) {
      toast("error", errorMessage(error));
    }
  };

  const removeFrom = (key: "watchedDirs" | "exclusions", value: string) => {
    update(
      key,
      draft[key].filter((entry) => entry !== value),
    );
  };

  const toggleRealtime = (next: boolean) => {
    if (next) {
      update("realtimeEnabled", true);
      return;
    }
    void confirm({
      title: t("settings.protectionOffConfirmTitle"),
      description: t("settings.protectionOffConfirmDesc"),
      confirmLabel: t("settings.protectionOffConfirm"),
      tone: "danger",
    }).then((approved) => {
      if (approved) update("realtimeEnabled", false);
    });
  };

  const handleSave = async () => {
    const nickname = draft.nickname.trim();
    if (!nickname) {
      setNicknameError(true);
      setTab("general");
      return;
    }
    setNicknameError(false);
    await saveSettings({ ...draft, nickname });
  };

  const handleReset = () => {
    setDraft(settings);
    setNicknameError(false);
    setShowKey(false);
  };

  const sizes = Array.from(
    new Set([16, 32, 64, 128, 256, 512, 1024, 2048, 4096, draft.maxFileSizeMb]),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-5 pb-2">
      <PageHeader
        title={t("topbar.settingsTitle")}
        description={t("topbar.settingsSubtitle")}
        actions={
          <Badge tone={active ? "success" : "warning"}>
            {active ? t("settings.statusActive") : t("settings.statusInactive")}
          </Badge>
        }
      />

      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-stroke bg-panel-2 p-1">
        {tabs.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-colors",
                selected
                  ? "bg-panel text-fg shadow-sm"
                  : "text-muted hover:text-fg",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(item.label)}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <div className="space-y-5">
          <SectionCard
            title={t("settings.generalProfile")}
            description={t("settings.nicknameHint")}
          >
            <div className="max-w-md">
              <label className="label" htmlFor="settings-nickname">
                {t("settings.nickname")}
              </label>
              <input
                id="settings-nickname"
                value={draft.nickname}
                maxLength={40}
                onChange={(event) => {
                  update("nickname", event.target.value);
                  setNicknameError(false);
                }}
                placeholder={t("settings.nicknamePlaceholder")}
                className={cn(
                  "input",
                  nicknameError && "border-danger/60 focus:border-danger",
                )}
              />
              {nicknameError && (
                <p className="mt-1.5 text-[11px] font-medium text-danger">
                  {t("settings.validationNickname")}
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard title={t("settings.appearance")}>
            <div>
              <div className="label">{t("settings.theme")}</div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <ThemeOption
                  value="dark"
                  selected={draft.theme === "dark"}
                  onClick={() => update("theme", "dark")}
                  label={t("settings.themeDark")}
                  icon={Moon}
                />
                <ThemeOption
                  value="light"
                  selected={draft.theme === "light"}
                  onClick={() => update("theme", "light")}
                  label={t("settings.themeLight")}
                  icon={Sun}
                />
                <ThemeOption
                  value="system"
                  selected={draft.theme === "system"}
                  onClick={() => update("theme", "system")}
                  label={t("settings.themeSystem")}
                  icon={Monitor}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="label">{t("settings.language")}</div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <LanguageOption
                  code="tr"
                  selected={draft.language !== "en"}
                  onClick={() => update("language", "tr")}
                  label="Türkçe"
                />
                <LanguageOption
                  code="en"
                  selected={draft.language === "en"}
                  onClick={() => update("language", "en")}
                  label="English"
                />
              </div>
              <p className="hint mt-2">{t("settings.languageHint")}</p>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === "protection" && (
        <div className="space-y-5">
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3.5",
              active
                ? "border-success/25 bg-success-soft"
                : "border-warning/25 bg-warning-soft",
            )}
          >
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                active
                  ? "border-success/25 bg-panel text-success"
                  : "border-warning/25 bg-panel text-warning",
              )}
            >
              {active ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldOff className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold">
                {active ? t("settings.statusActive") : t("settings.statusInactive")}
              </div>
              <div className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                {t("settings.protectionOnlyWhileOpen")}
              </div>
              {data.realtimeError && (
                <div className="mt-1 break-words text-[10.5px] font-medium text-danger">
                  {data.realtimeError}
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void retryRealtime()}
            >
              {t("settings.restartProtection")}
            </Button>
          </div>

          <SectionCard
            title={t("settings.protectionTitle")}
            description={t("settings.protectionDesc")}
          >
            <div className="flex items-center justify-between gap-5 rounded-xl border border-stroke bg-panel-2 p-4">
              <div>
                <div className="text-[12px] font-semibold">
                  {draft.realtimeEnabled
                    ? t("settings.statusActive")
                    : t("settings.statusInactive")}
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted">
                  {t("settings.saveHint")}
                </div>
              </div>
              <Toggle
                checked={draft.realtimeEnabled}
                onChange={toggleRealtime}
                label={t("settings.protectionTitle")}
                disabled={savePending}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t("settings.watchedDirs")}
            description={t("settings.watchedDirsHint")}
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                onClick={() => void addFolderTo("watchedDirs")}
              >
                {t("settings.addFolder")}
              </Button>
            }
          >
            {draft.watchedDirs.length === 0 ? (
              <p className="text-[11.5px] text-muted">{t("settings.noDirs")}</p>
            ) : (
              <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke bg-panel-2">
                {draft.watchedDirs.map((path) => (
                  <div key={path} className="flex items-center gap-3 px-3.5 py-2.5">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted" />
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[11px]"
                      title={path}
                    >
                      {path}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFrom("watchedDirs", path)}
                      aria-label={t("common.remove")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === "scan" && (
        <div className="space-y-5">
          <SectionCard title={t("settings.scanSettings")}>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-5 rounded-xl border border-stroke bg-panel-2 p-4">
                <div>
                  <div className="text-[12px] font-semibold">
                    {t("settings.archives")}
                  </div>
                  <p className="mt-0.5 max-w-xl text-[10.5px] leading-relaxed text-muted">
                    {t("settings.archivesHint")}
                  </p>
                </div>
                <Toggle
                  checked={draft.scanArchives}
                  onChange={(next) => update("scanArchives", next)}
                  label={t("settings.archives")}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stroke bg-panel-2 p-4">
                <div>
                  <div className="text-[12px] font-semibold">
                    {t("settings.maxSize")}
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-muted">
                    {t("settings.maxSizeHint")}
                  </p>
                </div>
                <select
                  value={draft.maxFileSizeMb}
                  onChange={(event) =>
                    update("maxFileSizeMb", Number(event.target.value))
                  }
                  className="input h-9 w-32 py-0 text-[12px]"
                >
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      {t("settings.scanSizeValue", { value: size })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={t("settings.exclusions")}
            description={t("settings.exclusionsHint")}
            action={
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FolderPlus className="h-3.5 w-3.5" />}
                  onClick={() => void addFolderTo("exclusions")}
                >
                  {t("settings.addFolder")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => void addFileToExclusions()}
                >
                  {t("settings.addFile")}
                </Button>
              </div>
            }
          >
            {draft.exclusions.length === 0 ? (
              <p className="text-[11.5px] text-muted">
                {t("settings.noExclusions")}
              </p>
            ) : (
              <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke bg-panel-2">
                {draft.exclusions.map((path) => (
                  <div key={path} className="flex items-center gap-3 px-3.5 py-2.5">
                    <FileSearch className="h-4 w-4 shrink-0 text-muted" />
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[11px]"
                      title={path}
                    >
                      {path}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFrom("exclusions", path)}
                      aria-label={t("common.remove")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={t("settings.schedule")}
            description={t("settings.scheduleHint")}
          >
            <div className="flex items-center justify-between gap-5 rounded-xl border border-stroke bg-panel-2 p-4">
              <div>
                <div className="text-[12px] font-semibold">
                  {t("settings.scheduleEnable")}
                </div>
                <p className="mt-0.5 text-[10.5px] text-muted">
                  {t("settings.scheduleHint")}
                </p>
              </div>
              <Toggle
                checked={draft.scheduledScan.enabled}
                onChange={(next) => updateSchedule({ enabled: next })}
                label={t("settings.scheduleEnable")}
              />
            </div>

            {draft.scheduledScan.enabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="label">{t("settings.frequency")}</div>
                  <div className="inline-flex w-full rounded-xl border border-stroke bg-panel-2 p-1">
                    {[
                      { value: "daily", label: t("settings.daily") },
                      { value: "weekly", label: t("settings.weekly") },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateSchedule({ frequency: option.value })}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                          draft.scheduledScan.frequency === option.value
                            ? "bg-panel text-fg shadow-sm"
                            : "text-muted hover:text-fg",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="schedule-time">
                    {t("settings.time")}
                  </label>
                  <input
                    id="schedule-time"
                    type="time"
                    value={draft.scheduledScan.time}
                    onChange={(event) => updateSchedule({ time: event.target.value })}
                    className="input h-10 w-36"
                  />
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === "vt" && (
        <div className="space-y-5">
          <SectionCard
            title={t("settings.vtTitle")}
            description={t("settings.vtDesc")}
            action={
              <Badge tone={draft.vtApiKey ? "success" : "neutral"}>
                {draft.vtApiKey
                  ? t("settings.vtConfigured")
                  : t("settings.vtNotConfigured")}
              </Badge>
            }
          >
            <div className="max-w-xl">
              <label className="label" htmlFor="vt-key">
                {t("settings.vtKey")}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px] flex-1">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <input
                    id="vt-key"
                    type={showKey ? "text" : "password"}
                    value={draft.vtApiKey ?? ""}
                    onChange={(event) => update("vtApiKey", event.target.value)}
                    placeholder={t("settings.vtKeyPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                    className="input pl-9 pr-10 font-mono text-[11.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    aria-label={
                      showKey ? t("settings.vtHide") : t("settings.vtShow")
                    }
                    className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-faint transition-colors hover:text-fg"
                  >
                    {showKey ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {draft.vtApiKey && (
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      update("vtApiKey", null);
                      setShowKey(false);
                    }}
                  >
                    {t("settings.vtRemove")}
                  </Button>
                )}
              </div>
              <p className="hint mt-2">{t("settings.vtKeyHint")}</p>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-info/20 bg-info-soft px-4 py-3.5">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <p className="text-[11px] leading-relaxed text-info">
                {t("settings.vtPrivacy")}
              </p>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === "about" && (
        <div className="space-y-5">
          <SectionCard>
            <div className="flex flex-wrap items-center gap-4">
              <Logo size={54} />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold tracking-tight">
                  FSODefender
                </div>
                <p className="mt-1 text-[11.5px] text-muted">
                  {t("settings.aboutDesc")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="brand">
                  {t("common.version", { version: data.appVersion })}
                </Badge>
                <Badge tone="neutral">{t("settings.localOnly")}</Badge>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t("settings.dataDir")}>
            <div className="flex flex-wrap items-center gap-3">
              <code className="min-w-[240px] flex-1 break-all rounded-xl border border-stroke bg-panel-2 px-3.5 py-2.5 font-mono text-[11px]">
                {data.dataDir}
              </code>
              <Button
                variant="secondary"
                size="sm"
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                onClick={() => void openDataDir()}
              >
                {t("settings.openDataDir")}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title={t("settings.components")}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <ComponentCard
                icon={HardDrive}
                label={t("settings.engine")}
                value="YARA-X · SHA-256 · PE"
              />
              <ComponentCard
                icon={Fingerprint}
                label={t("settings.signatures")}
                value={formatNumber(data.signatures, lang)}
              />
              <ComponentCard
                icon={FileSearch}
                label={t("settings.yaraRules")}
                value={formatNumber(data.yaraRules, lang)}
              />
              <ComponentCard
                icon={ShieldCheck}
                label={t("settings.realtime")}
                value={
                  active ? t("settings.statusActive") : t("settings.statusInactive")
                }
                tone={active ? "success" : "warning"}
              />
            </div>
          </SectionCard>

          <SectionCard title={t("settings.privacyTitle")}>
            <ul className="space-y-2.5">
              {[
                t("settings.privacy1"),
                t("settings.privacy2"),
                t("settings.privacy3"),
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span className="text-[11.5px] leading-relaxed text-muted">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-[11px] leading-relaxed text-warning">
                {t("settings.unsignedNote")}
              </p>
            </div>
          </SectionCard>
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stroke bg-panel/95 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted">
            <span className="h-2 w-2 rounded-full bg-warning" />
            {t("settings.unsaved")}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {t("settings.reset")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={savePending}
              onClick={() => void handleSave()}
            >
              {t("settings.saveChanges")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeOption({
  value,
  selected,
  onClick,
  label,
  icon: Icon,
}: {
  value: string;
  selected: boolean;
  onClick: () => void;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3.5 text-left transition-colors",
        selected
          ? "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20"
          : "border-stroke bg-panel-2 hover:border-stroke-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-semibold">
          <Icon className="h-3.5 w-3.5 text-muted" />
          {label}
        </span>
        {selected && <Check className="h-3.5 w-3.5 text-brand" />}
      </div>
      <div className="mt-3 flex gap-1.5">
        {(themeSwatches[value] ?? themeSwatches.dark).map((color) => (
          <span
            key={color}
            className="h-5 flex-1 rounded-md border border-black/5"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </button>
  );
}

function LanguageOption({
  code,
  selected,
  onClick,
  label,
}: {
  code: Language;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
        selected
          ? "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20"
          : "border-stroke bg-panel-2 hover:border-stroke-strong",
      )}
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg border border-stroke bg-panel text-[11px] font-bold text-muted">
        {code.toUpperCase()}
      </span>
      <span className="flex-1 text-[12px] font-semibold">{label}</span>
      {selected && <Check className="h-4 w-4 text-brand" />}
    </button>
  );
}

function ComponentCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stroke bg-panel-2 px-3.5 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-stroke bg-panel text-muted">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
          {label}
        </div>
        <div
          className={cn(
            "mt-0.5 truncate text-[12px] font-semibold",
            tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-warning"
                : "text-fg",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
