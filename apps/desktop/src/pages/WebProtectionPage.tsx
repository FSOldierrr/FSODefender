import {
  AlertTriangle,
  Globe2,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import { errorMessage } from "../lib/format";
import type { ReputationCheck } from "../lib/types";
import { cn } from "../lib/ui";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Toggle } from "../components/Toggle";

export function WebProtectionPage() {
  const { data, t, setPage, toast } = useApp();
  const [url, setUrl] = useState("");
  const [useVt, setUseVt] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReputationCheck | null>(null);

  const vtConfigured = data.vtConfigured;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = url.trim();
    setError(null);

    if (!candidate) {
      setError(t("web.errorInvalid"));
      return;
    }

    setChecking(true);
    setResult(null);
    try {
      const response = await api.checkUrl(candidate, useVt && vtConfigured);
      setResult(response);
      const vtThreat =
        response.vt !== null &&
        (response.vt.malicious > 0 || response.vt.suspicious > 0);
      if (response.local.verdict === "malicious") {
        toast("warning", t("toasts.urlThreat"));
      } else if (vtThreat) {
        toast("warning", t("web.vtThreatTitle"));
      } else {
        toast("success", t("toasts.urlClean"));
      }
    } catch (err) {
      const message = errorMessage(err);
      if (
        message.toLowerCase().includes("url") ||
        message.toLowerCase().includes("alan adı")
      ) {
        setError(t("web.errorInvalid"));
      } else {
        setError(message);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("topbar.webTitle")}
        description={t("topbar.webSubtitle")}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-brand/25 bg-brand-soft text-brand">
                <Globe2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{t("web.title")}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t("web.desc")}</p>
              </div>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setError(null);
                    }}
                    placeholder={t("web.inputPlaceholder")}
                    inputMode="url"
                    spellCheck={false}
                    autoComplete="off"
                    className="input h-11 pl-10 font-mono text-[12px]"
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  icon={<Search className="h-4 w-4" />}
                  loading={checking}
                  className="h-11 px-5"
                >
                  {checking ? t("web.checking") : t("web.check")}
                </Button>
              </div>
              {error && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {error}
                </p>
              )}
            </form>

            <div className="mt-4 border-t border-stroke pt-4">
              {vtConfigured ? (
                <div className="flex items-start justify-between gap-4 rounded-xl border border-stroke bg-panel-2 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-info/20 bg-info-soft text-info">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-[12px] font-semibold">
                        {t("web.vtToggle")}
                      </div>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                        {t("web.vtDesc")}
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={useVt}
                    onChange={setUseVt}
                    label={t("web.vtToggle")}
                    disabled={checking}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stroke bg-panel-2 p-3.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-stroke bg-panel text-muted">
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold">
                      {t("web.vtTitle")}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      {t("web.vtNotConfigured")}
                    </p>
                  </div>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => setPage("settings")}
                  >
                    {t("web.vtGoSettings")}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {result ? (
            <ResultCard result={result} />
          ) : (
            <section className="card px-6 py-12">
              <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="absolute inset-0 rounded-2xl bg-brand/10 blur-xl" />
                  <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-stroke bg-panel-2 text-brand">
                    <ShieldQuestion className="h-7 w-7" />
                  </div>
                </div>
                <h2 className="text-sm font-semibold">{t("web.emptyTitle")}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {t("web.emptyDesc")}
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-success/20 bg-success-soft text-success">
                <LockKeyhole className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[13px] font-semibold">{t("web.privacyNote")}</h2>
                <Badge tone="success" className="mt-1">
                  {t("web.localOnly")}
                </Badge>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              {t("web.localOnlyDesc")}
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-[13px] font-semibold">{t("web.tipsTitle")}</h2>
            <ol className="mt-3 space-y-3">
              {[t("web.tip1"), t("web.tip2"), t("web.tip3")].map(
                (tip, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-stroke bg-panel-2 text-[10px] font-bold text-muted">
                      {index + 1}
                    </span>
                    <p className="text-[11px] leading-relaxed text-muted">{tip}</p>
                  </li>
                ),
              )}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: ReputationCheck }) {
  const { t, lang, data } = useApp();
  const localThreat = result.local.verdict === "malicious";
  const vtThreat =
    result.vt !== null &&
    (result.vt.malicious > 0 || result.vt.suspicious > 0);
  const dangerous = localThreat;
  const warning = !dangerous && vtThreat;
  const status = dangerous ? "danger" : warning ? "warning" : "success";
  const Icon = dangerous ? ShieldAlert : warning ? AlertTriangle : ShieldCheck;

  const flaggedCount = result.vt
    ? result.vt.malicious + result.vt.suspicious
    : 0;

  let title = t("web.cleanTitle");
  let description = t("web.cleanDesc", { host: result.local.host });
  if (dangerous) {
    title = t("web.threatTitle");
    description = t("web.threatDesc", { host: result.local.host });
  } else if (warning) {
    title = t("web.vtThreatTitle");
    description = t("web.vtThreatDesc", { count: flaggedCount });
  } else if (result.vt) {
    title = t("web.vtCleanTitle");
    description = t("web.vtCleanDesc");
  }

  return (
    <section
      className={cn(
        "card overflow-hidden border",
        status === "danger"
          ? "border-danger/30"
          : status === "warning"
            ? "border-warning/30"
            : "border-success/30",
      )}
    >
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <span
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl border",
            status === "danger"
              ? "border-danger/25 bg-danger-soft text-danger"
              : status === "warning"
                ? "border-warning/25 bg-warning-soft text-warning"
                : "border-success/25 bg-success-soft text-success",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <Badge tone={status}>
              {dangerous
                ? t("web.malicious")
                : warning
                  ? t("web.suspicious")
                  : t("web.clean")}
            </Badge>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {description}
          </p>
          <p className="mt-2 break-all font-mono text-[10.5px] text-faint">
            {result.local.url}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {t("web.source")}: {t("web.sourceLocal")}
            </Badge>
            {result.vt && (
              <Badge tone="info">
                {t("web.source")}: {t("web.sourceVt")}
              </Badge>
            )}
            <span className="text-[10.5px] text-muted">
              {t("common.appTagline")}: {data.signatures} hash · {data.yaraRules} YARA
            </span>
          </div>

          {result.local.matches.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                {t("web.matches")}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.local.matches.map((match) => (
                  <span
                    key={match}
                    className="rounded-md border border-danger/20 bg-danger-soft px-2 py-1 font-mono text-[10px] text-danger"
                  >
                    {match}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {result.vt && (
        <div className="border-t border-stroke bg-panel-2/50 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold">{t("web.vtStats")}</h3>
            {result.vt.status !== "completed" && (
              <Badge tone="warning">{t("web.vtStatus")}: {result.vt.status}</Badge>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VtMetric
              label={t("web.vtMalicious")}
              value={result.vt.malicious}
              tone={result.vt.malicious > 0 ? "danger" : undefined}
            />
            <VtMetric
              label={t("web.vtSuspicious")}
              value={result.vt.suspicious}
              tone={result.vt.suspicious > 0 ? "warning" : undefined}
            />
            <VtMetric label={t("web.vtHarmless")} value={result.vt.harmless} />
            <VtMetric label={t("web.vtUndetected")} value={result.vt.undetected} />
          </div>
          {result.vt.status !== "completed" && (
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              {t("web.vtPending")}
            </p>
          )}
          <p className="mt-3 text-[10px] text-faint">
            {t("web.vtDesc")} ({lang.toUpperCase()})
          </p>
        </div>
      )}
    </section>
  );
}

function VtMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="rounded-xl border border-stroke bg-panel px-3.5 py-2.5">
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
