import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import { errorMessage, formatDateTime, modeLabel, scanDuration } from "../lib/format";
import type { FindingRecord, ScanRecord } from "../lib/types";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ScanDetailModal({
  scan,
  open,
  onClose,
}: {
  scan: ScanRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang, toast } = useApp();
  const [findings, setFindings] = useState<FindingRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !scan) {
      setFindings(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFindings(null);
    api
      .scanFindings(scan.id)
      .then((result) => {
        if (!cancelled) setFindings(result);
      })
      .catch((error) => {
        if (!cancelled) toast("error", errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scan, toast]);

  if (!scan) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("scan.scanDetails")}
      description={`${formatDateTime(scan.finishedAt, lang)} · ${t("scan.summaryDuration")}: ${scanDuration(scan.startedAt, scan.finishedAt, lang)}`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("scan.mode")} value={modeLabel(scan.mode, lang)} />
        <Metric label={t("scan.summaryScanned")} value={String(scan.scanned)} />
        <Metric
          label={t("scan.summaryMalicious")}
          value={String(scan.malicious)}
          tone={scan.malicious > 0 ? "danger" : undefined}
        />
        <Metric
          label={t("scan.summarySkipped")}
          value={String(scan.skipped)}
        />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">{t("scan.findings")}</h3>
        <span className="text-[11px] text-muted">
          {findings ? t("common.recordCount", { count: findings.length }) : ""}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("scan.loadingFindings")}
        </div>
      ) : !findings || findings.length === 0 ? (
        <div className="rounded-xl border border-stroke bg-panel-2 px-4 py-8 text-center text-xs text-muted">
          {t("scan.noStoredFindings")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stroke">
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-stroke bg-panel-2">
              <tr>
                <th className="table-head px-3.5 py-2.5">{t("scan.path")}</th>
                <th className="table-head hidden px-3.5 py-2.5 sm:table-cell">
                  {t("scan.reason")}
                </th>
                <th className="table-head w-24 px-3.5 py-2.5">{t("scan.result")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {findings.map((finding, index) => (
                <tr key={`${finding.path}-${index}`} className="row-hover align-top">
                  <td className="px-3.5 py-3">
                    <div className="truncate text-[12px] font-medium" title={finding.path}>
                      {finding.path.split("\\").pop() || finding.path}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-faint" title={finding.path}>
                      {finding.path}
                    </div>
                  </td>
                  <td className="hidden px-3.5 py-3 text-[11px] leading-relaxed text-muted sm:table-cell">
                    <div className="line-clamp-2" title={finding.reason}>
                      {finding.reason}
                    </div>
                  </td>
                  <td className="px-3.5 py-3">
                    <Badge
                      tone={
                        finding.verdict === "malicious"
                          ? "danger"
                          : finding.verdict === "suspicious"
                            ? "warning"
                            : "success"
                      }
                    >
                      {finding.verdict === "malicious"
                        ? t("web.malicious")
                        : finding.verdict === "suspicious"
                          ? t("web.suspicious")
                          : t("web.clean")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-stroke bg-panel-2 px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </div>
      <div
        className={`mt-1.5 truncate text-[15px] font-bold tabular-nums ${
          tone === "danger" ? "text-danger" : "text-fg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
