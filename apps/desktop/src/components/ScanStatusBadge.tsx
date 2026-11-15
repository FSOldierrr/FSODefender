import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { useApp } from "../lib/context";
import type { ScanRecord } from "../lib/types";
import { Badge } from "./Badge";

export function ScanStatusBadge({ scan }: { scan: ScanRecord }) {
  const { t } = useApp();
  if (scan.cancelled) {
    return <Badge tone="neutral">{t("scan.statusCancelled")}</Badge>;
  }
  if (scan.malicious > 0) {
    return (
      <Badge tone="danger" icon={<ShieldAlert className="h-3 w-3" />}>
        {t("scan.statusThreat", { count: scan.malicious })}
      </Badge>
    );
  }
  if (scan.suspicious > 0) {
    return (
      <Badge tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
        {t("scan.statusSuspicious", { count: scan.suspicious })}
      </Badge>
    );
  }
  return (
    <Badge tone="success" icon={<ShieldCheck className="h-3 w-3" />}>
      {t("scan.statusClean")}
    </Badge>
  );
}
