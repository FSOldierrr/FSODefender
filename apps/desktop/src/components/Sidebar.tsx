import {
  ChevronRight,
  Globe2,
  History,
  LayoutDashboard,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
} from "lucide-react";
import type { ReactNode, ComponentType } from "react";
import { useApp } from "../lib/context";
import type { PageId } from "../lib/context";
import { Logo } from "./Logo";
import { cn } from "../lib/ui";

interface NavItem {
  id: PageId;
  labelKey:
    | "nav.dashboard"
    | "nav.scan"
    | "nav.quarantine"
    | "nav.web"
    | "nav.history"
    | "nav.settings";
  icon: ComponentType<{ className?: string }>;
  badge?: number;
}

export function Sidebar() {
  const { data, page, setPage, t } = useApp();
  const settings = data.settings;

  const error = Boolean(data.realtimeError);
  const active = settings.realtimeEnabled && data.realtimeActive;

  const mainItems: NavItem[] = [
    { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { id: "scan", labelKey: "nav.scan", icon: ScanLine },
    {
      id: "quarantine",
      labelKey: "nav.quarantine",
      icon: ShieldAlert,
      badge: data.quarantine.length,
    },
    { id: "web", labelKey: "nav.web", icon: Globe2 },
  ];

  const systemItems: NavItem[] = [
    { id: "history", labelKey: "nav.history", icon: History },
    { id: "settings", labelKey: "nav.settings", icon: Settings },
  ];

  const initial = (settings.nickname || "F").trim().charAt(0).toUpperCase();

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-stroke bg-panel">
      <div className="flex h-[76px] items-center gap-3 border-b border-stroke px-5">
        <Logo size={35} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-tight">
            FSODefender
          </div>
          <div className="text-[10.5px] font-medium tracking-wide text-muted">
            {t("common.appTagline")}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavGroupLabel>{t("nav.protectionGroup")}</NavGroupLabel>
        <div className="space-y-1">
          {mainItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={page === item.id}
              label={t(item.labelKey)}
              onClick={() => setPage(item.id)}
              badge={item.badge}
            />
          ))}
        </div>

        <NavGroupLabel className="mt-6">{t("nav.systemGroup")}</NavGroupLabel>
        <div className="space-y-1">
          {systemItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={page === item.id}
              label={t(item.labelKey)}
              onClick={() => setPage(item.id)}
            />
          ))}
        </div>
      </nav>

      <div className="space-y-2.5 border-t border-stroke p-3.5">
        <button
          type="button"
          onClick={() => setPage("settings")}
          className="w-full rounded-xl border border-stroke bg-panel-2 p-3 text-left transition-colors hover:border-stroke-strong"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {active && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  error ? "bg-danger" : active ? "bg-success" : "bg-warning",
                )}
              />
            </span>
            <span className="text-[11.5px] font-semibold">
              {error
                ? t("dashboard.errorBadge")
                : active
                  ? t("dashboard.protectedBadge")
                  : t("dashboard.offlineBadge")}
            </span>
            {error ? (
              <ShieldX className="ml-auto h-3.5 w-3.5 text-danger" />
            ) : active ? (
              <ShieldCheck className="ml-auto h-3.5 w-3.5 text-success" />
            ) : (
              <ShieldOff className="ml-auto h-3.5 w-3.5 text-warning" />
            )}
          </div>
          <div className="mt-1.5 text-[10.5px] text-muted">
            {data.settings.watchedDirs.length} {t("dashboard.watchedDirs")}
          </div>
        </button>

        <div className="flex items-center gap-2.5 rounded-xl border border-stroke bg-panel-2 p-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-[13px] font-bold text-brand">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold">
              {settings.nickname || "FSODefender"}
            </div>
            <div className="text-[10px] text-muted">{t("common.localProfile")}</div>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[10px] text-faint">
          <span>FSODefender</span>
          <span>
            v{data.appVersion} · {t("settings.localOnly")}
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavGroupLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}

function NavButton({
  item,
  active,
  label,
  onClick,
  badge,
}: {
  item: NavItem;
  active: boolean;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        active
          ? "bg-brand-soft text-brand"
          : "text-muted hover:bg-panel-2 hover:text-fg",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg transition-colors",
          active
            ? "bg-brand/10 text-brand"
            : "text-faint group-hover:text-fg",
        )}
      >
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
            active ? "bg-brand/15 text-brand" : "bg-panel-3 text-muted",
          )}
        >
          {badge}
        </span>
      ) : active ? (
        <ChevronRight className="h-3.5 w-3.5 opacity-60" />
      ) : null}
    </button>
  );
}
