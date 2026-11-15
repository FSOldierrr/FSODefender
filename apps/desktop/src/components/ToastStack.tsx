import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { ToastKind } from "../lib/context";
import { cn } from "../lib/ui";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

const tones: Record<
  ToastKind,
  { wrap: string; icon: string; Icon: typeof Info }
> = {
  success: {
    wrap: "border-success/25",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  error: { wrap: "border-danger/25", icon: "text-danger", Icon: XCircle },
  warning: {
    wrap: "border-warning/25",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
  info: { wrap: "border-info/25", icon: "text-info", Icon: Info },
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[390px] max-w-[calc(100vw-40px)] flex-col gap-2.5">
      {toasts.map((toast) => {
        const tone = tones[toast.kind];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "animate-fade-up pointer-events-auto flex items-start gap-3 rounded-xl border bg-panel px-4 py-3.5 shadow-2xl",
              tone.wrap,
            )}
          >
            <tone.Icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", tone.icon)} />
            <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-relaxed text-fg">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-faint transition-colors hover:text-fg"
              aria-label="Kapat / Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
