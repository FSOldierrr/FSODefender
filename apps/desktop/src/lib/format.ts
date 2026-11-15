import type { Language, ScanMode, Severity, Verdict } from "./types";

const locales: Record<Language, string> = { tr: "tr-TR", en: "en-US" };

export function localeOf(lang: Language): string {
  return locales[lang];
}

export function formatBytes(bytes: number, lang: Language): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  const maximumFractionDigits = exp === 0 || value >= 10 ? 0 : 1;
  return `${value.toLocaleString(localeOf(lang), { maximumFractionDigits })} ${units[exp]}`;
}

export function formatDateTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(iso: string | null | undefined, lang: Language): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDurationMs(ms: number, lang: Language): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toLocaleString(localeOf(lang), { maximumFractionDigits: 1 })} ${lang === "tr" ? "sn" : "s"}`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} ${lang === "tr" ? "dk" : "m"} ${rest} ${lang === "tr" ? "sn" : "s"}`;
}

export function scanDuration(startedAt: string, finishedAt: string, lang: Language): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "—";
  return formatDurationMs(Math.max(0, end - start), lang);
}

export function formatNumber(value: number, lang: Language): string {
  return value.toLocaleString(localeOf(lang));
}

export function truncateMiddle(value: string, max = 64): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

export function verdictTone(verdict: Verdict): "success" | "warning" | "danger" {
  if (verdict === "malicious") return "danger";
  if (verdict === "suspicious") return "warning";
  return "success";
}

export function severityTone(severity: Severity | string): "info" | "warning" | "danger" {
  if (severity === "malicious") return "danger";
  if (severity === "suspicious" || severity === "warning") return "warning";
  return "info";
}

export function modeLabel(mode: string, lang: Language): string {
  const labels: Record<string, [string, string]> = {
    quick: ["Hızlı tarama", "Quick scan"],
    full: ["Tam tarama", "Full scan"],
    custom: ["Özel tarama", "Custom scan"],
    realtime: ["Gerçek zamanlı", "Real-time"],
  };
  const entry = labels[mode] ?? [mode, mode];
  return lang === "tr" ? entry[0] : entry[1];
}

export function modeFromScan(mode: ScanMode): string {
  return mode;
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function percent(current: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}
