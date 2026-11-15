import {
  Activity,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "../lib/context";
import type { TranslationKey } from "../lib/i18n";
import { relativeTime } from "../lib/i18n";
import type { EventRecord } from "../lib/types";
import { cn } from "../lib/ui";

const kindKeys: Record<string, TranslationKey> = {
  scan: "history.kind.scan",
  threat: "history.kind.threat",
  quarantine: "history.kind.quarantine",
  realtime: "history.kind.realtime",
  settings: "history.kind.settings",
  schedule: "history.kind.schedule",
  app: "history.kind.app",
  other: "history.kind.other",
};

const kindIcons: Record<string, LucideIcon> = {
  scan: ScanLine,
  threat: ShieldAlert,
  quarantine: ShieldCheck,
  realtime: ShieldAlert,
  settings: Settings,
  schedule: Clock3,
  app: Activity,
  other: Activity,
};

export function EventRow({ event }: { event: EventRecord }) {
  const { t, lang } = useApp();
  const Icon = kindIcons[event.kind] ?? Activity;
  const kindLabel = t(kindKeys[event.kind] ?? "history.kind.other");

  const tone =
    event.severity === "malicious"
      ? "border-danger/20 bg-danger-soft text-danger"
      : event.severity === "warning"
        ? "border-warning/20 bg-warning-soft text-warning"
        : "border-stroke bg-panel-2 text-muted";

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
          tone,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-relaxed text-fg">{event.message}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-faint">
          <span className="font-semibold uppercase tracking-wide">{kindLabel}</span>
          <span>·</span>
          <span>{relativeTime(event.createdAt, lang)}</span>
        </div>
      </div>
    </div>
  );
}
