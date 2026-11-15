import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ChevronRight,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../lib/context";
import {
  formatDateTime,
  formatNumber,
  modeLabel,
  scanDuration,
} from "../lib/format";
import type { ScanRecord } from "../lib/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { EventRow } from "../components/EventRow";
import { PageHeader } from "../components/PageHeader";
import { ScanDetailModal } from "../components/ScanDetailModal";
import { ScanStatusBadge } from "../components/ScanStatusBadge";
import { cn } from "../lib/ui";

type HistoryTab = "scans" | "events";
type EventFilter = "all" | "warnings" | "threats";

export function HistoryPage() {
  const { data, t, lang, refresh, setPage } = useApp();
  const [tab, setTab] = useState<HistoryTab>("scans");
  const [filter, setFilter] = useState<EventFilter>("all");
  const [detailScan, setDetailScan] = useState<ScanRecord | null>(null);

  const events = useMemo(() => {
    if (filter === "threats") {
      return data.events.filter((event) => event.severity === "malicious");
    }
    if (filter === "warnings") {
      return data.events.filter(
        (event) =>
          event.severity === "warning" || event.severity === "suspicious",
      );
    }
    return data.events;
  }, [data.events, filter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("topbar.historyTitle")}
        description={t("topbar.historySubtitle")}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-stroke bg-panel-2 p-1">
          <TabButton
            active={tab === "scans"}
            onClick={() => setTab("scans")}
            icon={<ScanLine className="h-3.5 w-3.5" />}
          >
            {t("history.tabScans")}
            <span className="rounded-md bg-panel px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
              {data.scans.length}
            </span>
          </TabButton>
          <TabButton
            active={tab === "events"}
            onClick={() => setTab("events")}
            icon={<Activity className="h-3.5 w-3.5" />}
          >
            {t("history.tabEvents")}
            <span className="rounded-md bg-panel px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
              {data.events.length}
            </span>
          </TabButton>
        </div>

        {tab === "events" && (
          <div className="flex items-center gap-1.5">
            <FilterButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {t("history.filterAll")}
            </FilterButton>
            <FilterButton
              active={filter === "warnings"}
              onClick={() => setFilter("warnings")}
            >
              {t("history.filterWarnings")}
            </FilterButton>
            <FilterButton
              active={filter === "threats"}
              onClick={() => setFilter("threats")}
            >
              {t("history.filterThreats")}
            </FilterButton>
          </div>
        )}
      </div>

      {tab === "scans" ? (
        <section className="card overflow-hidden">
          {data.scans.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={t("history.emptyScans")}
              description={t("history.emptyScansDesc")}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setPage("scan")}
                >
                  {t("quarantine.emptyAction")}
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b border-stroke bg-panel-2">
                  <tr>
                    <th className="table-head px-5 py-2.5">{t("scan.date")}</th>
                    <th className="table-head px-4 py-2.5">{t("scan.mode")}</th>
                    <th className="table-head px-4 py-2.5">{t("scan.scanned")}</th>
                    <th className="table-head px-4 py-2.5">
                      {t("scan.summaryDuration")}
                    </th>
                    <th className="table-head px-4 py-2.5">{t("scan.result")}</th>
                    <th className="w-10 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke">
                  {data.scans.map((scan) => (
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
      ) : (
        <section className="card overflow-hidden">
          {events.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={t("history.emptyEvents")}
              description={t("history.emptyEventsDesc")}
            />
          ) : (
            <div className="divide-y divide-stroke">
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex items-center gap-2 text-[10px] text-faint">
        <Badge tone="neutral">
          {t("history.scansCount", { count: data.scans.length })}
        </Badge>
        <Badge tone="neutral">
          {t("history.eventsCount", { count: data.events.length })}
        </Badge>
      </div>

      <ScanDetailModal
        scan={detailScan}
        open={detailScan !== null}
        onClose={() => setDetailScan(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
        active
          ? "bg-panel text-fg shadow-sm"
          : "text-muted hover:text-fg",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "border-brand/30 bg-brand-soft text-brand"
          : "border-stroke bg-panel text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
