import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  AppStats,
  BootstrapData,
  EventRecord,
  FindingRecord,
  Language,
  QuarantineEntry,
  ReputationCheck,
  ScanMode,
  ScanRecord,
  ScanReport,
} from "./types";

export const api = {
  bootstrap: () => invoke<BootstrapData>("bootstrap"),
  saveSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  completeOnboarding: (nickname: string, language: Language, realtimeEnabled: boolean) =>
    invoke<AppSettings>("complete_onboarding", {
      nickname,
      language,
      realtimeEnabled,
    }),
  startScan: (mode: ScanMode, path?: string | null) =>
    invoke<ScanReport>("start_scan", { mode, path: path ?? null }),
  cancelScan: () => invoke<boolean>("cancel_scan"),
  retryRealtime: () => invoke<boolean>("retry_realtime"),
  realtimeStatus: () => invoke<boolean>("realtime_status"),
  quarantineList: () => invoke<QuarantineEntry[]>("quarantine_list"),
  quarantineScanResult: (path: string) =>
    invoke<QuarantineEntry>("quarantine_scan_result", { path }),
  quarantineRestore: (id: string, targetDir?: string | null) =>
    invoke<string>("quarantine_restore", { id, targetDir: targetDir ?? null }),
  quarantineDelete: (id: string) => invoke<void>("quarantine_delete", { id }),
  scanHistory: (limit?: number) =>
    invoke<ScanRecord[]>("scan_history", { limit: limit ?? null }),
  scanFindings: (scanId: string) =>
    invoke<FindingRecord[]>("scan_findings", { scanId }),
  activityEvents: (limit?: number) =>
    invoke<EventRecord[]>("activity_events", { limit: limit ?? null }),
  getStats: () => invoke<AppStats>("get_stats"),
  checkUrl: (url: string, useVt: boolean) =>
    invoke<ReputationCheck>("check_url", { url, useVt }),
  openDataDir: () => invoke<void>("open_data_dir"),
};
