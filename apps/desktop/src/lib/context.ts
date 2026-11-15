import { createContext, useContext } from "react";
import type { TranslationKey, TranslationVars } from "./i18n";
import type {
  AppSettings,
  BootstrapData,
  Language,
  ScanMode,
  ScanProgress,
  ScanReport,
} from "./types";

export type PageId =
  | "dashboard"
  | "scan"
  | "quarantine"
  | "web"
  | "history"
  | "settings";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

export interface AppContextValue {
  data: BootstrapData;
  lang: Language;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
  page: PageId;
  setPage: (page: PageId) => void;
  settings: AppSettings;
  saveSettings: (next: AppSettings) => Promise<boolean>;
  savePending: boolean;
  isDark: boolean;
  completeOnboarding: (
    nickname: string,
    language: Language,
    realtimeEnabled: boolean,
  ) => Promise<boolean>;
  refresh: () => Promise<void>;
  scanRunning: boolean;
  scanStarting: boolean;
  scanProgress: ScanProgress | null;
  lastReport: ScanReport | null;
  startScan: (mode: ScanMode, path?: string | null) => Promise<void>;
  cancelScan: () => Promise<void>;
  dismissReport: () => void;
  toast: (kind: ToastKind, message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  retryRealtime: () => Promise<void>;
  openDataDir: () => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppContext.Provider");
  }
  return context;
}
