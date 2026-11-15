import {
  Activity,
  ArrowRight,
  ChevronRight,
  Clock3,
  FileSearch,
  Fingerprint,
  FolderOpen,
  FolderSearch,
  HardDrive,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../lib/context";
import { errorMessage, formatDate, formatDateTime, formatNumber } from "../lib/format";
import { relativeTime } from "../lib/i18n";
import { cn } from "../lib/ui";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { EventRow } from "../components/EventRow";
import { PageHeader, StatCard } from "../components/PageHeader";

export function DashboardPage() {
  const {
    data,
    t,
    lang,
    setPage,
    startScan,
    retryRealtime,
    saveSettings,
    settings,
    refresh,
    toast,
  } = useApp();

  const error = data.realtimeError;
  const active = settings.realtimeEnabled && data.realtimeActive;
  const paused = !settings.realtimeEnabled;
  const threatCount = data.quarantine.length;

  const handleCustom = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("scan.selectFolder"),
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path === "string" && path.length > 0) {
        await startScan("custom", path);
      }
    } catch (err) {
      toast("error", errorMessage(err));
    }
  };

  const enableProtection = async () => {
    if (error) {
      await retryRealtime();
    } else {
      await saveSettings({ ...settings, realtimeEnabled: true });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("topbar.dashboardTitle")}
        description={t("topbar.dashboardSubtitle")}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {
              void refresh();
            }}
          >
            {t("common.refresh")}
          </Button>
        }
      />

      <section className="relative overflow-hidden rounded-2xl border border-stroke bg-panel">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-24 h-64 w-64 rounded-full bg-info/5 blur-3xl" />

        <div className="relative flex flex-col gap-7 p-6 lg:flex-row lg:items-center lg:p-7">
          <StatusOrb active={active} error={Boolean(error)} paused={paused} />

          <div className="min-w-0 flex-1">
            <div className="eyebrow">{t("dashboard.protectionStatus")}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <h2 className="text-[27px] font-bold leading-tight tracking-tight">
                {error
                  ? t("dashboard.errorTitle")
                  : active
                    ? t("dashboard.protectedTitle")
                    : t("dashboard.pausedTitle")}
              </h2>
              <Badge tone={error ? "danger" : active ? "success" : "warning"}>
                {error
                  ? t("dashboard.errorBadge")
                  : active
                    ? t("dashboard.protectedBadge")
                    : t("dashboard.offlineBadge")}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
              {error
                ? t("dashboard.errorDesc", { error })
                : active
                  ? t("dashboard.protectedDesc")
                  : t("dashboard.pausedDesc")}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <MetaChip icon={<Fingerprint className="h-3.5 w-3.5" />}>
                {formatNumber(data.signatures, lang)} {t("dashboard.signatures")}
              </MetaChip>
              <MetaChip icon={<FileSearch className="h-3.5 w-3.5" />}>
                {formatNumber(data.yaraRules, lang)} {t("dashboard.yaraRules")}
              </MetaChip>
              <MetaChip icon={<FolderOpen className="h-3.5 w-3.5" />}>
                {formatNumber(settings.watchedDirs.length, lang)}{" "}
                {t("dashboard.watchedDirs")}
              </MetaChip>
            </div>

            {(error || paused) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant={error ? "danger" : "primary"}
                  size="sm"
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  onClick={() => void enableProtection()}
                >
                  {t("dashboard.enableProtection")}
                </Button>
                <button
                  type="button"
                  onClick={() => setPage("settings")}
                  className="text-[11px] font-semibold text-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  {t("nav.settings")}
                </button>
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-2.5 lg:w-[248px]">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              icon={<Zap className="h-[18px] w-[18px]" />}
              onClick={() => void startScan("quick")}
            >
              {t("dashboard.quickScan")}
            </Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                variant="secondary"
                icon={<HardDrive className="h-4 w-4" />}
                onClick={() => void startScan("full")}
              >
                {t("dashboard.fullScan")}
              </Button>
              <Button
                variant="secondary"
                icon={<FolderSearch className="h-4 w-4" />}
                onClick={() => void handleCustom()}
              >
                {t("dashboard.customScan")}
              </Button>
            </div>
            <div className="mt-1 text-center text-[10.5px] text-faint">
              {data.stats.lastScanAt
                ? `${t("dashboard.statLastScan")}: ${formatDateTime(data.stats.lastScanAt, lang)}`
                : t("dashboard.noScanYet")}
            </div>
          </div>
        </div>
      </section>

      {threatCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3">
          <ShieldAlert className="h-[18px] w-[18px] shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-[12px] font-medium text-warning">
            {t("dashboard.quarantinedBanner", { count: threatCount })}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setPage("quarantine")}>
            {t("dashboard.reviewQuarantine")}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dashboard.statScans")}
          value={formatNumber(data.stats.totalScans, lang)}
          icon={ScanLine}
        />
        <StatCard
          label={t("dashboard.statThreats")}
          value={formatNumber(data.stats.maliciousFound, lang)}
          hint={`${formatNumber(data.stats.suspiciousFound, lang)} ${t("scan.suspicious").toLowerCase()}`}
          icon={ShieldAlert}
          tone="danger"
        />
        <StatCard
          label={t("dashboard.statQuarantine")}
          value={formatNumber(data.stats.quarantinedActive, lang)}
          hint={
            data.stats.quarantinedActive > 0
              ? t("dashboard.reviewQuarantine")
              : t("dashboard.noThreats")
          }
          icon={ShieldCheck}
          tone="warning"
        />
        <StatCard
          label={t("dashboard.statLastScan")}
          value={
            data.stats.lastScanAt
              ? formatDate(data.stats.lastScanAt, lang)
              : "—"
          }
          hint={
            data.stats.lastScanAt
              ? formatDateTime(data.stats.lastScanAt, lang)
              : t("dashboard.noScanYet")
          }
          icon={Clock3}
          tone="info"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t("dashboard.recentThreats")}</h2>
              <p className="mt-1 text-[11px] text-muted">
                {t("quarantine.activeCount", { count: threatCount })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage("quarantine")}
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              {t("dashboard.viewAll")}
            </Button>
          </header>

          {data.quarantine.length === 0 ? (
            <EmptyState
              compact
              icon={ShieldCheck}
              title={t("dashboard.noThreats")}
              description={t("dashboard.noThreatsDesc")}
            />
          ) : (
            <div className="space-y-2">
              {data.quarantine.slice(0, 4).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setPage("quarantine")}
                  className="flex w-full items-center gap-3 rounded-xl border border-stroke bg-panel-2/60 p-3 text-left transition-colors hover:border-stroke-strong"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-danger/20 bg-danger-soft text-danger">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">
                      {entry.fileName}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                      {entry.reason}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[10px] text-faint sm:block">
                    {relativeTime(entry.quarantinedAt, lang)}
                  </span>
                  <Badge tone="danger">{t("web.malicious")}</Badge>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t("dashboard.activity")}</h2>
              <p className="mt-1 text-[11px] text-muted">
                {t("history.eventsCount", { count: data.events.length })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage("history")}
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              {t("dashboard.viewHistory")}
            </Button>
          </header>

          {data.events.length === 0 ? (
            <EmptyState
              compact
              icon={Activity}
              title={t("dashboard.noActivity")}
              description={t("dashboard.noActivityDesc")}
            />
          ) : (
            <div className="space-y-1">
              {data.events.slice(0, 6).map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusOrb({
  active,
  error,
  paused,
}: {
  active: boolean;
  error: boolean;
  paused: boolean;
}) {
  const Icon = error ? ShieldX : active ? ShieldCheck : paused ? ShieldOff : ShieldAlert;
  return (
    <div className="relative grid h-32 w-32 shrink-0 place-items-center sm:h-36 sm:w-36">
      <div className="absolute inset-0 rounded-full border border-dashed border-stroke" />
      <div
        className={cn(
          "pulse-ring absolute inset-3 rounded-full",
          error ? "bg-danger-soft" : active ? "bg-brand-soft" : "bg-warning-soft",
        )}
      />
      <div className="absolute inset-7 rounded-full border border-stroke bg-panel-2 shadow-inner" />
      <Icon
        className={cn(
          "relative h-12 w-12",
          error ? "text-danger" : active ? "text-brand" : "text-warning",
        )}
        strokeWidth={1.5}
      />
    </div>
  );
}

function MetaChip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-panel-2 px-2.5 py-1 text-[10.5px] font-medium text-muted">
      {icon}
      {children}
    </span>
  );
}
