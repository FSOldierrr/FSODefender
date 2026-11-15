import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { api } from "./lib/api";
import {
  AppContext,
  useApp,
  type AppContextValue,
  type ConfirmOptions,
  type PageId,
  type ToastKind,
} from "./lib/context";
import { errorMessage } from "./lib/format";
import {
  translate,
  type TranslationKey,
  type TranslationVars,
} from "./lib/i18n";
import type {
  AppSettings,
  BootstrapData,
  Language,
  ScanMode,
  ScanProgress,
  ScanReport,
  ScanStartedEvent,
  ThreatEvent,
} from "./lib/types";
import { cn } from "./lib/ui";
import { Button } from "./components/Button";
import { Logo } from "./components/Logo";
import { Modal } from "./components/Modal";
import { Sidebar } from "./components/Sidebar";
import { ToastStack, type ToastItem } from "./components/ToastStack";
import { TopBar } from "./components/TopBar";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { QuarantinePage } from "./pages/QuarantinePage";
import { ScanPage } from "./pages/ScanPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WebProtectionPage } from "./pages/WebProtectionPage";

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

function systemLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export default function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState<PageId>("dashboard");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [savePending, setSavePending] = useState(false);

  const [scanRunning, setScanRunning] = useState(false);
  const [scanStarting, setScanStarting] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [lastReport, setLastReport] = useState<ScanReport | null>(null);

  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBootError(null);
    void (async () => {
      try {
        const bootstrap = await api.bootstrap();
        if (!cancelled) setData(bootstrap);
      } catch (error) {
        if (!cancelled) setBootError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const lang: Language = data?.settings.language === "en" ? "en" : "tr";
  const langRef = useRef<Language>(lang);
  langRef.current = lang;

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      translate(langRef.current, key, vars),
    [],
  );

  const themeSetting =
    data?.settings.theme === "light"
      ? "light"
      : data?.settings.theme === "system"
        ? "system"
        : "dark";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        themeSetting === "dark" ||
        (themeSetting === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      setIsDark(dark);
    };
    apply();
    try {
      localStorage.setItem("fsod.theme", themeSetting);
    } catch {
      // Depolama kullanılamıyorsa görünüm yine de uygulanır.
    }
    const onChange = () => {
      if (themeSetting === "system") apply();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeSetting]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5500);
  }, []);

  const notify = useCallback(async (title: string, body: string) => {
    try {
      if (await isPermissionGranted()) {
        sendNotification({ title, body });
      }
    } catch (error) {
      console.warn("FSODefender: bildirim gönderilemedi", error);
    }
  }, []);

  const ensureNotificationPermission = useCallback(async () => {
    try {
      if (!(await isPermissionGranted())) {
        await requestPermission();
      }
    } catch (error) {
      console.warn("FSODefender: bildirim izni alınamadı", error);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.bootstrap();
      setData(next);
    } catch (error) {
      console.error("FSODefender: veriler yenilenemedi", error);
    }
  }, []);

  const saveSettings = useCallback(
    async (next: AppSettings): Promise<boolean> => {
      setSavePending(true);
      try {
        const saved = await api.saveSettings(next);
        setData((previous) =>
          previous ? { ...previous, settings: saved } : previous,
        );
        const savedLanguage: Language =
          saved.language === "en" ? "en" : "tr";
        toast(
          "success",
          translate(savedLanguage, "toasts.settingsSaved"),
        );
        try {
          const fresh = await api.bootstrap();
          setData(fresh);
        } catch (error) {
          console.warn("FSODefender: ayar sonrası yenileme başarısız", error);
        }
        return true;
      } catch (error) {
        toast("error", errorMessage(error));
        return false;
      } finally {
        setSavePending(false);
      }
    },
    [toast],
  );

  const completeOnboarding = useCallback(
    async (
      nickname: string,
      language: Language,
      realtimeEnabled: boolean,
    ): Promise<boolean> => {
      setSavePending(true);
      try {
        await api.completeOnboarding(nickname, language, realtimeEnabled);
        const fresh = await api.bootstrap();
        setData(fresh);
        setPage("dashboard");
        toast(
          "success",
          translate(language, "onboarding.welcomeToast", { name: nickname }),
        );
        if (realtimeEnabled) {
          if (fresh.realtimeActive) {
            toast(
              "success",
              translate(language, "onboarding.protectionStarted"),
            );
          } else {
            toast(
              "error",
              translate(language, "toasts.protectionError", {
                error: fresh.realtimeError ?? translate(language, "common.unknown"),
              }),
            );
          }
        }
        void ensureNotificationPermission();
        return true;
      } catch (error) {
        toast("error", errorMessage(error));
        return false;
      } finally {
        setSavePending(false);
      }
    },
    [ensureNotificationPermission, toast],
  );

  const startScan = useCallback(
    async (mode: ScanMode, path?: string | null) => {
      if (scanRunning || scanStarting) {
        toast("info", t("toasts.scanAlreadyRunning"));
        return;
      }
      setScanStarting(true);
      setScanProgress(null);
      setLastReport(null);
      setPage("scan");
      try {
        const report = await api.startScan(mode, path ?? null);
        setLastReport(report);
        setScanProgress(null);
        setScanRunning(false);
        await refresh();
      } catch (error) {
        const message = errorMessage(error);
        if (
          message.toLowerCase().includes("zaten") ||
          message.toLowerCase().includes("already")
        ) {
          toast("info", t("toasts.scanAlreadyRunning"));
        } else {
          toast("error", t("toasts.scanStartError", { error: message }));
        }
      } finally {
        setScanStarting(false);
        setScanRunning(false);
      }
    },
    [refresh, scanRunning, scanStarting, t, toast],
  );

  const cancelScan = useCallback(async () => {
    try {
      await api.cancelScan();
    } catch (error) {
      toast("error", errorMessage(error));
    }
  }, [toast]);

  const dismissReport = useCallback(() => {
    setLastReport(null);
  }, []);

  const retryRealtime = useCallback(async () => {
    setSavePending(true);
    try {
      const active = await api.retryRealtime();
      const fresh = await api.bootstrap();
      setData(fresh);
      if (active) {
        toast("success", t("toasts.protectionStarted"));
      } else {
        toast(
          "error",
          t("toasts.protectionError", {
            error: fresh.realtimeError ?? t("common.unknown"),
          }),
        );
      }
    } catch (error) {
      toast(
        "error",
        t("toasts.protectionError", { error: errorMessage(error) }),
      );
    } finally {
      setSavePending(false);
    }
  }, [t, toast]);

  const openDataDir = useCallback(async () => {
    try {
      await api.openDataDir();
    } catch (error) {
      toast("error", errorMessage(error));
    }
  }, [toast]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const finishConfirm = useCallback((value: boolean) => {
    setConfirmState((current) => {
      if (current) current.resolve(value);
      return null;
    });
  }, []);

  const uiRef = useRef({
    t,
    toast,
    notify,
    refresh,
    startScan,
    ready: false,
  });

  uiRef.current = {
    t,
    toast,
    notify,
    refresh,
    startScan,
    ready: Boolean(data?.settings.onboardingComplete),
  };

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    const addListener = async <T extends unknown>(
      name: string,
      handler: (payload: T) => void,
    ) => {
      const unlisten = await listen<T>(name, (event) =>
        handler(event.payload),
      );
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    };

    void addListener<ScanStartedEvent>("scan:started", (payload) => {
      setScanStarting(false);
      setScanRunning(true);
      setScanProgress(null);
      setLastReport(null);
      if (payload.scheduled) {
        setPage("scan");
        uiRef.current.toast(
          "info",
          uiRef.current.t("toasts.scanScheduledStarted"),
        );
      }
    });

    void addListener<ScanProgress>("scan:progress", (payload) => {
      setScanProgress(payload);
    });

    void addListener<ScanReport>("scan:finished", (report) => {
      const ui = uiRef.current;
      setScanRunning(false);
      setScanStarting(false);
      setScanProgress(null);
      setLastReport(report);
      void ui.refresh();
      if (report.cancelled) {
        ui.toast("warning", ui.t("toasts.scanCancelled"));
      } else if (report.malicious > 0) {
        ui.toast(
          "warning",
          ui.t("toasts.scanFinishedThreats", { count: report.malicious }),
        );
        void ui.notify(
          ui.t("notify.scanTitle"),
          ui.t("notify.scanBody", { count: report.malicious }),
        );
      } else {
        ui.toast("success", ui.t("toasts.scanFinishedClean"));
      }
    });

    void addListener<ThreatEvent>("protection:threat", (payload) => {
      const ui = uiRef.current;
      ui.toast(
        "error",
        ui.t("toasts.threatBlocked", { name: payload.entry.fileName }),
      );
      void ui.notify(
        ui.t("notify.threatTitle"),
        ui.t("notify.threatBody", { name: payload.entry.fileName }),
      );
      void ui.refresh();
    });

    void addListener<string>("protection:activity", (message) => {
      uiRef.current.toast("info", message);
    });

    void addListener<string>("protection:error", (message) => {
      const ui = uiRef.current;
      ui.toast("error", ui.t("toasts.protectionError", { error: message }));
      void ui.refresh();
    });

    void addListener<void>("quarantine:changed", () => {
      void uiRef.current.refresh();
    });

    void addListener<void>("tray:quick-scan", () => {
      const ui = uiRef.current;
      if (!ui.ready) return;
      void ui.startScan("quick");
    });

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  if (bootError || !data) {
    return (
      <StartupError
        message={bootError ?? "Bootstrap data unavailable"}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  if (!data.settings.onboardingComplete) {
    return (
      <>
        <OnboardingPage
          initialSettings={data.settings}
          onComplete={completeOnboarding}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const contextValue: AppContextValue = {
    data,
    lang,
    t,
    page,
    setPage,
    settings: data.settings,
    saveSettings,
    savePending,
    isDark,
    completeOnboarding,
    refresh,
    scanRunning,
    scanStarting,
    scanProgress,
    lastReport,
    startScan,
    cancelScan,
    dismissReport,
    toast,
    confirm,
    retryRealtime,
    openDataDir,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="flex h-screen overflow-hidden bg-canvas text-fg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="relative flex-1 overflow-y-auto">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(61,220,151,0.055),transparent_65%)]" />
            <div className="relative mx-auto w-full max-w-[1280px] px-7 py-6">
              <CurrentPage page={page} />
            </div>
          </main>
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog state={confirmState} onResolve={finishConfirm} />
    </AppContext.Provider>
  );
}

function CurrentPage({ page }: { page: PageId }) {
  switch (page) {
    case "dashboard":
      return <DashboardPage />;
    case "scan":
      return <ScanPage />;
    case "quarantine":
      return <QuarantinePage />;
    case "web":
      return <WebProtectionPage />;
    case "history":
      return <HistoryPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}

function ConfirmDialog({
  state,
  onResolve,
}: {
  state: ConfirmState | null;
  onResolve: (value: boolean) => void;
}) {
  const { t } = useApp();
  if (!state) return null;
  const danger = state.options.tone === "danger";

  return (
    <Modal
      open
      onClose={() => onResolve(false)}
      title={state.options.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onResolve(false)}>
            {state.options.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => onResolve(true)}
          >
            {state.options.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
            danger
              ? "border-danger/25 bg-danger-soft text-danger"
              : "border-warning/25 bg-warning-soft text-warning",
          )}
        >
          <AlertTriangle className="h-5 w-5" />
        </span>
        <p className="pt-0.5 text-[12px] leading-relaxed text-muted">
          {state.options.description}
        </p>
      </div>
    </Modal>
  );
}

function SplashScreen() {
  const lang = systemLanguage();
  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-canvas">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <Logo size={72} />
          <span className="absolute inset-0 animate-ping rounded-full border border-brand/30" />
        </div>
        <div className="mt-6 text-[19px] font-bold tracking-tight">
          FSODefender
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {translate(lang, "startup.loading")}
        </div>
      </div>
    </div>
  );
}

function StartupError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const lang = systemLanguage();
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-canvas px-6">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="card relative w-full max-w-md p-7 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-danger/25 bg-danger-soft text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold tracking-tight">
          {translate(lang, "startup.errorTitle")}
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {translate(lang, "startup.errorDesc")}
        </p>
        <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-stroke bg-panel-2 p-3 text-left font-mono text-[10px] leading-relaxed text-muted">
          {message}
        </pre>
        <Button
          variant="primary"
          className="mt-5"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={onRetry}
        >
          {translate(lang, "startup.retry")}
        </Button>
      </div>
    </div>
  );
}
