import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  File,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Square,
  X,
  Zap,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import {
  errorMessage,
  formatBytes,
  formatDateTime,
  formatNumber,
  modeLabel,
  percent,
  scanDuration,
  truncateMiddle,
} from "../lib/format";
import type { FileScanResult, ScanMode, ScanRecord, ScanReport } from "../lib/types";
import { cn } from "../lib/ui";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { ScanDetailModal } from "../components/ScanDetailModal";
import { ScanStatusBadge } from "../components/ScanStatusBadge";

export function ScanPage() {
  const {
    data,
    t,
    lang,
    refresh,
    toast,
    scanRunning,
    scanStarting,
    lastReport,
    startScan,
    cancelScan,
    dismissReport,
  } = useApp();

  const [mode, setMode] = useState<ScanMode>("quick");
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [detailScan, setDetailScan] = useState<ScanRecord | null>(null);

  useEffect(() => {
    if (!scanRunning) setCancelRequested(false);
  }, [scanRunning]);

  const modes: Array<{
    id: ScanMode;
    title: string;
    description: string;
    meta: string;
    icon: typeof Zap;
  }> = [
    {
      id: "quick",
      title: t("scan.quickTitle"),
      description: t("scan.quickDesc"),
      meta: t("scan.quickMeta"),
      icon: Zap,
    },
    {
      id: "full",
      title: t("scan.fullTitle"),
      description: t("scan.fullDesc"),
      meta: t("scan.fullMeta"),
      icon: HardDrive,
    },
    {
      id: "custom",
      title: t("scan.customTitle"),
      description: t("scan.customDesc"),
      meta: t("scan.customMeta"),
      icon: FolderSearch,
    },
  ];

  const selectedMode = modes.find((item) => item.id === mode) ?? modes[0];

  const pickFolder = async (): Promise<string | null> => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("scan.selectFolder"),
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path === "string" && path.length > 0) {
        setCustomPath(path);
        setMode("custom");
        return path;
      }
      return null;
    } catch (error) {
      toast("error", errorMessage(error));
      return null;
    }
  };

  const pickFile = async (): Promise<string | null> => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: t("scan.selectFile"),
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (typeof path === "string" && path.length > 0) {
        setCustomPath(path);
        setMode("custom");
        return path;
      }
      return null;
    } catch (error) {
      toast("error", errorMessage(error));
      return null;
    }
  };

  const handleStart = async () => {
    if (scanRunning || scanStarting) {
      toast("info", t("toasts.scanAlreadyRunning"));
      return;
    }
    if (mode === "custom") {
      const path = customPath ?? (await pickFolder());
      if (!path) return;
      await startScan("custom", path);
      return;
    }
    await startScan(mode);
  };

  const handleCancel = async () => {
    setCancelRequested(true);
    try {
      await cancelScan();
    } catch (error) {
      setCancelRequested(false);
      toast("error", errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("topbar.scanTitle")}
        description={t("topbar.scanSubtitle")}
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

      {(scanRunning || scanStarting) && (
        <ScanProgressCard
          cancelRequested={cancelRequested}
          onCancel={() => void handleCancel()}
        />
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {modes.map((item) => {
          const Icon = item.icon;
          const selected = mode === item.id;
          const disabled = scanRunning || scanStarting;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => setMode(item.id)}
              className={cn(
                "group relative rounded-2xl border bg-panel p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                selected
                  ? "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20"
                  : "border-stroke hover:border-stroke-strong",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl border",
                    selected
                      ? "border-brand/25 bg-brand-soft text-brand"
                      : "border-stroke bg-panel-2 text-muted group-hover:text-fg",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "mt-1 grid h-4 w-4 place-items-center rounded-full border-2 transition-colors",
                    selected ? "border-brand" : "border-stroke-strong",
                  )}
                >
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </span>
              </div>
              <div className="mt-4 text-sm font-semibold">{item.title}</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {item.description}
              </div>
              <div className="mt-3 text-[10px] font-medium uppercase tracking-wider text-faint">
                {item.meta}
              </div>
            </button>
          );
        })}
      </div>

      {mode === "custom" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stroke bg-panel-2 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-stroke bg-panel text-muted">
            <FolderOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              {t("scan.selectedPath")}
            </div>
            <div
              className="mt-0.5 truncate font-mono text-[11px] text-fg"
              title={customPath ?? undefined}
            >
              {customPath ?? t("scan.noPath")}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<File className="h-3.5 w-3.5" />}
            onClick={() => void pickFile()}
            disabled={scanRunning || scanStarting}
          >
            {t("scan.selectFile")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            onClick={() => void pickFolder()}
            disabled={scanRunning || scanStarting}
          >
            {t("scan.selectFolder")}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stroke bg-panel px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold">{selectedMode.title}</div>
          <div className="mt-0.5 text-[10.5px] text-muted">{selectedMode.meta}</div>
        </div>
        <Button
          variant="primary"
          icon={<Play className="h-4 w-4" />}
          loading={scanStarting}
          disabled={
            scanRunning ||
            (mode === "custom" && !customPath)
          }
          onClick={() => void handleStart()}
        >
          {scanStarting ? t("scan.starting") : t("scan.startScan")}
        </Button>
      </div>

      {lastReport && !scanRunning && (
        <ReportCard report={lastReport} onDismiss={dismissReport} />
      )}

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-stroke px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{t("scan.recentScans")}</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {t("history.scansCount", { count: data.scans.length })}
            </p>
          </div>
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
        </header>

        {data.scans.length === 0 ? (
          <EmptyState
            compact
            icon={ScanLine}
            title={t("scan.noScans")}
            description={t("scan.noScansDesc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-stroke bg-panel-2">
                <tr>
                  <th className="table-head px-5 py-2.5">{t("scan.date")}</th>
                  <th className="table-head px-4 py-2.5">{t("scan.mode")}</th>
                  <th className="table-head px-4 py-2.5">{t("scan.scanned")}</th>
                  <th className="table-head px-4 py-2.5">{t("scan.summaryDuration")}</th>
                  <th className="table-head px-4 py-2.5">{t("scan.result")}</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {data.scans.slice(0, 10).map((scan) => (
                  <tr
                    key={scan.id}
                    onClick={() => setDetailScan(scan)}
                    className="row-hover cursor-pointer"
                  >
                    <td className="px-5 py-3 text-[11.5px] text-muted">
                      {formatDateTime(scan.finishedAt, lang)}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-medium">
                      {modeLabel(scan.mode, lang)}
                    </td>
                    <td className="px-4 py-3 text-[11.5px] tabular-nums text-muted">
                      {formatNumber(scan.scanned, lang)}
                    </td>
                    <td className="px-4 py-3 text-[11.5px] tabular-nums text-muted">
                      {scanDuration(scan.startedAt, scan.finishedAt, lang)}
                    </td>
                    <td className="px-4 py-3">
                      <ScanStatusBadge scan={scan} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-faint" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ScanDetailModal
        scan={detailScan}
        open={detailScan !== null}
        onClose={() => setDetailScan(null)}
      />
    </div>
  );
}

function ScanProgressCard({
  cancelRequested,
  onCancel,
}: {
  cancelRequested: boolean;
  onCancel: () => void;
}) {
  const { t, lang, scanStarting, scanProgress } = useApp();
  const current = scanProgress?.current ?? 0;
  const total = scanProgress?.total ?? 0;
  const pct = percent(current, total);

  return (
    <section className="card relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative grid h-12 w-12 place-items-center rounded-xl border border-brand/25 bg-brand-soft text-brand">
            {scanStarting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ScanLine className="h-5 w-5" />
            )}
            {!scanStarting && (
              <span className="absolute inset-0 animate-ping rounded-xl border border-brand/25" />
            )}
          </span>
          <div>
            <div className="text-sm font-semibold">{t("scan.running")}</div>
            <div className="mt-0.5 text-[11px] text-muted">{t("scan.runningDesc")}</div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Square className="h-3 w-3" />}
          onClick={onCancel}
          disabled={cancelRequested}
        >
          {cancelRequested ? t("scan.cancelRequested") : t("scan.cancelScan")}
        </Button>
      </div>

      <div className="relative mt-5">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="font-semibold tabular-nums text-fg">{pct}%</span>
          <span className="tabular-nums">
            {formatNumber(current, lang)} / {formatNumber(total, lang)}
          </span>
        </div>
        <div
          className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-panel-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("scan.running")}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-info transition-[width] duration-300"
            style={{ width: `${Math.max(pct, total > 0 ? 1 : 0)}%` }}
          />
          <div className="shimmer absolute inset-0" />
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2.5">
        <ProgressMetric label={t("scan.scanned")} value={formatNumber(current, lang)} />
        <ProgressMetric
          label={t("scan.threats")}
          value={formatNumber(scanProgress?.malicious ?? 0, lang)}
          tone="danger"
        />
        <ProgressMetric
          label={t("scan.suspicious")}
          value={formatNumber(scanProgress?.suspicious ?? 0, lang)}
          tone="warning"
        />
      </div>

      {scanProgress?.currentPath && (
        <div className="relative mt-4 flex items-center gap-2 rounded-lg border border-stroke bg-panel-2 px-3 py-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-faint">
            {t("scan.currentFile")}
          </span>
          <span
            className="min-w-0 truncate font-mono text-[10.5px] text-muted"
            title={scanProgress.currentPath}
          >
            {truncateMiddle(scanProgress.currentPath, 100)}
          </span>
        </div>
      )}
    </section>
  );
}

function ProgressMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="rounded-xl border border-stroke bg-panel-2 px-3.5 py-2.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-bold tabular-nums",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  onDismiss,
}: {
  report: ScanReport;
  onDismiss: () => void;
}) {
  const { t, lang, toast, confirm, refresh } = useApp();
  const [quarantined, setQuarantined] = useState<Set<string>>(new Set());
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const handleQuarantine = async (result: FileScanResult) => {
    const approved = await confirm({
      title: t("scan.quarantineConfirmTitle"),
      description: t("scan.quarantineConfirmDesc", {
        name: result.name || result.path,
      }),
      confirmLabel: t("scan.quarantineAction"),
      tone: "danger",
    });
    if (!approved) return;

    setBusyPath(result.path);
    try {
      await api.quarantineScanResult(result.path);
      setQuarantined((current) => new Set(current).add(result.path));
      toast("success", t("toasts.fileQuarantined", { name: result.name }));
      await refresh();
    } catch (error) {
      toast("error", errorMessage(error));
    } finally {
      setBusyPath(null);
    }
  };

  const cancelled = report.cancelled;
  const hasThreats = report.malicious > 0;
  const hasSuspicious = report.suspicious > 0;
  const tone = cancelled
    ? "neutral"
    : hasThreats
      ? "danger"
      : hasSuspicious
        ? "warning"
        : "success";
  const Icon = cancelled
    ? ShieldX
    : hasThreats
      ? ShieldAlert
      : hasSuspicious
        ? AlertTriangle
        : CheckCircle2;
  const title = cancelled
    ? t("scan.completedCancelled")
    : hasThreats
      ? t("scan.completedThreats", { count: report.malicious })
      : hasSuspicious
        ? t("scan.completedSuspicious", { count: report.suspicious })
        : t("scan.completedClean");

  return (
    <section
      className={cn(
        "card overflow-hidden border",
        tone === "danger"
          ? "border-danger/25"
          : tone === "warning"
            ? "border-warning/25"
            : tone === "success"
              ? "border-success/25"
              : "border-stroke",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stroke px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-11 w-11 place-items-center rounded-xl border",
              tone === "danger"
                ? "border-danger/25 bg-danger-soft text-danger"
                : tone === "warning"
                  ? "border-warning/25 bg-warning-soft text-warning"
                  : tone === "success"
                    ? "border-success/25 bg-success-soft text-success"
                    : "border-stroke bg-panel-2 text-muted",
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="eyebrow">{t("scan.completed")}</div>
            <h2 className="mt-0.5 text-[15px] font-semibold">{title}</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">
              {formatDateTime(report.finishedAt, lang)} ·{" "}
              {scanDuration(report.startedAt, report.finishedAt, lang)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={onDismiss}
          >
            {t("scan.newScan")}
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-panel-2 hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-5">
        <SummaryMetric label={t("scan.summaryScanned")} value={formatNumber(report.scanned, lang)} />
        <SummaryMetric
          label={t("scan.summaryMalicious")}
          value={formatNumber(report.malicious, lang)}
          tone={report.malicious > 0 ? "danger" : undefined}
        />
        <SummaryMetric
          label={t("scan.summarySuspicious")}
          value={formatNumber(report.suspicious, lang)}
          tone={report.suspicious > 0 ? "warning" : undefined}
        />
        <SummaryMetric label={t("scan.summarySkipped")} value={formatNumber(report.skipped, lang)} />
        <SummaryMetric label={t("scan.summaryErrors")} value={formatNumber(report.errors, lang)} />
      </div>

      <div className="border-t border-stroke px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold">{t("scan.findings")}</h3>
          <span className="text-[10.5px] text-muted">
            {t("common.recordCount", { count: report.results.length })}
          </span>
        </div>

        {report.results.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title={t("scan.noFindings")}
            description={t("scan.noFindingsDesc")}
          />
        ) : (
          <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke">
            {report.results.map((result, index) => (
              <FindingRow
                key={`${result.path}-${index}`}
                result={result}
                lang={lang}
                t={t}
                quarantined={quarantined.has(result.path)}
                busy={busyPath === result.path}
                onQuarantine={() => void handleQuarantine(result)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="rounded-xl border border-stroke bg-panel-2 px-3.5 py-3">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[19px] font-bold tabular-nums",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FindingRow({
  result,
  lang,
  t,
  quarantined,
  busy,
  onQuarantine,
}: {
  result: FileScanResult;
  lang: "tr" | "en";
  t: ReturnType<typeof useApp>["t"];
  quarantined: boolean;
  busy: boolean;
  onQuarantine: () => void;
}) {
  const dangerous = result.verdict === "malicious";
  const suspicious = result.verdict === "suspicious";
  return (
    <div className="flex items-start gap-3 bg-panel px-4 py-3">
      <span
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
          dangerous
            ? "border-danger/20 bg-danger-soft text-danger"
            : suspicious
              ? "border-warning/20 bg-warning-soft text-warning"
              : "border-stroke bg-panel-2 text-muted",
        )}
      >
        {dangerous ? (
          <ShieldAlert className="h-6 w-6" />
        ) : suspicious ? (
          <AlertTriangle className="h-6 w-6" />
        ) : (
          <ShieldCheck className="h-6 w-6" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold" title={result.name}>
          {result.name || result.path}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-faint" title={result.path}>
          {result.path}
        </div>
        <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
          {result.error ??
            (result.findings.length > 0
              ? result.findings.map((finding) => finding.title).join(" · ")
              : t("scan.noFindings"))}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge
          tone={dangerous ? "danger" : suspicious ? "warning" : "success"}
        >
          {dangerous
            ? t("web.malicious")
            : suspicious
              ? t("web.suspicious")
              : t("web.clean")}
        </Badge>
        <span className="text-[10px] tabular-nums text-faint">
          {formatBytes(result.size, lang)}
        </span>
        {dangerous && !result.error && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-1 h-7 px-2.5 text-[10.5px]"
            icon={<LockKeyhole className="h-3 w-3" />}
            loading={busy}
            disabled={quarantined}
            onClick={onQuarantine}
          >
            {quarantined
              ? t("scan.quarantinedBadge")
              : t("scan.quarantineAction")}
          </Button>
        )}
      </div>
    </div>
  );
}
