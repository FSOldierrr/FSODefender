import {
  ChevronRight,
  Loader2,
  Moon,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sun,
} from "lucide-react";
import { useApp } from "../lib/context";
import type { PageId } from "../lib/context";
import type { Language } from "../lib/types";
import { cn } from "../lib/ui";

const titleKeys: Record<
  PageId,
  {
    title:
      | "topbar.dashboardTitle"
      | "topbar.scanTitle"
      | "topbar.quarantineTitle"
      | "topbar.webTitle"
      | "topbar.historyTitle"
      | "topbar.settingsTitle";
  }
> = {
  dashboard: { title: "topbar.dashboardTitle" },
  scan: { title: "topbar.scanTitle" },
  quarantine: { title: "topbar.quarantineTitle" },
  web: { title: "topbar.webTitle" },
  history: { title: "topbar.historyTitle" },
  settings: { title: "topbar.settingsTitle" },
};

export function TopBar() {
  const {
    data,
    page,
    setPage,
    t,
    lang,
    settings,
    saveSettings,
    savePending,
    isDark,
    scanRunning,
  } = useApp();

  const error = Boolean(data.realtimeError);
  const protectedNow = settings.realtimeEnabled && data.realtimeActive;
  const changeLanguage = (next: Language) => {
    if (next === lang || savePending) return;
    void saveSettings({ ...settings, language: next });
  };

  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-stroke bg-canvas/85 px-7 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-[12px]">
        <span className="font-medium text-faint">FSODefender</span>
        <ChevronRight className="h-3.5 w-3.5 text-faint/70" />
        <span className="truncate font-semibold text-fg">{t(titleKeys[page].title)}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {scanRunning && (
          <button
            type="button"
            onClick={() => setPage("scan")}
            className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft px-3 py-1.5 text-[11px] font-semibold text-brand transition-colors hover:border-brand/45"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("topbar.scanning")}
          </button>
        )}

        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold",
            error
              ? "border-danger/25 bg-danger-soft text-danger"
              : protectedNow
                ? "border-success/25 bg-success-soft text-success"
                : "border-warning/25 bg-warning-soft text-warning",
          )}
        >
          {error ? (
            <ShieldAlert className="h-3.5 w-3.5" />
          ) : protectedNow ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          {error
            ? t("topbar.attention")
            : protectedNow
              ? t("topbar.protected")
              : t("topbar.paused")}
        </div>

        <div className="mx-0.5 h-6 w-px bg-stroke" />

        <div
          className="flex items-center rounded-lg border border-stroke bg-panel-2 p-0.5"
          role="group"
          aria-label={t("topbar.languageAria")}
        >
          {(["tr", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              disabled={savePending}
              onClick={() => changeLanguage(code)}
              className={cn(
                "rounded-md px-2 py-1 text-[10.5px] font-bold tracking-wide transition-colors disabled:opacity-50",
                lang === code
                  ? "bg-panel text-fg shadow-sm"
                  : "text-faint hover:text-fg",
              )}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={savePending}
          onClick={() =>
            void saveSettings({
              ...settings,
              theme: isDark ? "light" : "dark",
            })
          }
          title={t("topbar.themeAria")}
          aria-label={t("topbar.themeAria")}
          className="grid h-8 w-8 place-items-center rounded-lg border border-stroke bg-panel-2 text-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
