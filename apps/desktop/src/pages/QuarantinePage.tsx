import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  FileWarning,
  LockKeyhole,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import {
  errorMessage,
  formatBytes,
  formatDate,
  formatDateTime,
  verdictTone,
} from "../lib/format";
import type { QuarantineEntry } from "../lib/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";

export function QuarantinePage() {
  const { data, t, lang, refresh, toast, confirm, setPage } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<QuarantineEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const entries = data.quarantine;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      `${entry.fileName} ${entry.originalPath} ${entry.reason}`
        .toLowerCase()
        .includes(needle),
    );
  }, [entries, query]);

  const handleRestore = async (entry: QuarantineEntry) => {
    const approved = await confirm({
      title: t("quarantine.restoreTitle"),
      description: t("quarantine.restoreDesc", { name: entry.fileName }),
      confirmLabel: t("quarantine.restoreAction"),
    });
    if (!approved) return;

    setBusyId(entry.id);
    try {
      const restoredPath = await api.quarantineRestore(entry.id);
      toast(
        "success",
        t("toasts.quarantineRestored", { path: restoredPath }),
      );
      setSelected(null);
      await refresh();
    } catch (error) {
      toast("error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (entry: QuarantineEntry) => {
    const approved = await confirm({
      title: t("quarantine.deleteTitle"),
      description: t("quarantine.deleteDesc", { name: entry.fileName }),
      confirmLabel: t("quarantine.deleteAction"),
      tone: "danger",
    });
    if (!approved) return;

    setBusyId(entry.id);
    try {
      await api.quarantineDelete(entry.id);
      toast("success", t("toasts.quarantineDeleted"));
      setSelected(null);
      await refresh();
    } catch (error) {
      toast("error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("topbar.quarantineTitle")}
        description={t("topbar.quarantineSubtitle")}
        actions={
          <>
            <Badge tone="warning">
              {t("quarantine.activeCount", { count: entries.length })}
            </Badge>
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
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-stroke bg-panel-2 px-4 py-3">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-[11.5px] leading-relaxed text-muted">
          {t("quarantine.encryptedNote")}
        </p>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke px-5 py-4">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("quarantine.searchPlaceholder")}
              aria-label={t("quarantine.searchAria")}
              className="input h-9 pl-9 text-[12px]"
            />
          </div>
          <span className="text-[11px] text-muted">
            {t("common.recordCount", { count: filtered.length })}
          </span>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={t("quarantine.emptyTitle")}
            description={t("quarantine.emptyDesc")}
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
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t("quarantine.noResults")}
            description={t("quarantine.noResultsDesc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="border-b border-stroke bg-panel-2">
                <tr>
                  <th className="table-head px-5 py-2.5">{t("quarantine.colFile")}</th>
                  <th className="table-head px-4 py-2.5">{t("quarantine.colThreat")}</th>
                  <th className="table-head px-4 py-2.5">{t("quarantine.colSize")}</th>
                  <th className="table-head px-4 py-2.5">{t("quarantine.colDate")}</th>
                  <th className="table-head w-28 px-4 py-2.5 text-right">
                    {t("quarantine.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {filtered.map((entry) => {
                  const busy = busyId === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className="row-hover cursor-pointer"
                      onClick={() => setSelected(entry)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-danger/20 bg-danger-soft text-danger">
                            <FileWarning className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold">
                              {entry.fileName}
                            </div>
                            <div
                              className="mt-0.5 max-w-[360px] truncate font-mono text-[10px] text-faint"
                              title={entry.originalPath}
                            >
                              {entry.originalPath}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Badge tone={verdictTone(entry.verdict)}>
                            {entry.verdict === "malicious"
                              ? t("web.malicious")
                              : entry.verdict === "suspicious"
                                ? t("web.suspicious")
                                : t("web.clean")}
                          </Badge>
                        </div>
                        <div
                          className="mt-1 max-w-[260px] truncate text-[10.5px] text-muted"
                          title={entry.reason}
                        >
                          {entry.reason}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] tabular-nums text-muted">
                        {formatBytes(entry.size, lang)}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-muted">
                        {formatDate(entry.quarantinedAt, lang)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title={t("quarantine.restoreAction")}
                            aria-label={t("quarantine.restoreAction")}
                            disabled={Boolean(busyId)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRestore(entry);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-brand-soft hover:text-brand disabled:opacity-40"
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            title={t("quarantine.deleteAction")}
                            aria-label={t("quarantine.deleteAction")}
                            disabled={Boolean(busyId)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDelete(entry);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={t("quarantine.detailsTitle")}
        description={selected?.fileName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t("common.close")}
            </Button>
            {selected && (
              <>
                <Button
                  variant="secondary"
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  disabled={Boolean(busyId)}
                  onClick={() => void handleRestore(selected)}
                >
                  {t("quarantine.restoreAction")}
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  disabled={Boolean(busyId)}
                  onClick={() => void handleDelete(selected)}
                >
                  {t("quarantine.deleteAction")}
                </Button>
              </>
            )}
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-danger/20 bg-danger-soft text-danger">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">
                  {selected.fileName}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {formatDateTime(selected.quarantinedAt, lang)} ·{" "}
                  {formatBytes(selected.size, lang)}
                </div>
              </div>
              <Badge tone={verdictTone(selected.verdict)} className="ml-auto">
                {selected.verdict === "malicious"
                  ? t("web.malicious")
                  : selected.verdict === "suspicious"
                    ? t("web.suspicious")
                    : t("web.clean")}
              </Badge>
            </div>

            <dl className="space-y-3 rounded-xl border border-stroke bg-panel-2 p-4">
              <DetailRow label={t("quarantine.originalPath")} mono>
                {selected.originalPath}
              </DetailRow>
              {selected.sha256 && (
                <DetailRow label={t("quarantine.sha")} mono>
                  {selected.sha256}
                </DetailRow>
              )}
              <DetailRow label={t("quarantine.reason")}>{selected.reason}</DetailRow>
            </dl>

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-warning">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("quarantine.restoreDesc", { name: selected.fileName })}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </dt>
      <dd
        className={`mt-1 break-all text-[11.5px] leading-relaxed text-fg ${
          mono ? "font-mono" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
