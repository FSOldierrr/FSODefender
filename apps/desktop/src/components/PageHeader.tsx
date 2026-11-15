import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/ui";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-fg">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "danger" | "warning" | "info";
}) {
  const tones = {
    brand: "bg-brand-soft text-brand border-brand/20",
    danger: "bg-danger-soft text-danger border-danger/20",
    warning: "bg-warning-soft text-warning border-warning/20",
    info: "bg-info-soft text-info border-info/20",
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-semibold text-muted">{label}</span>
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
            tones[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 text-[26px] font-bold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-2 truncate text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
