import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/ui";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
      )}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-brand/10 blur-xl" />
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-stroke bg-panel-2 text-brand">
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
