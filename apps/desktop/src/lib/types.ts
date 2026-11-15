export type Language = "tr" | "en";
export type Theme = "dark" | "light" | "system";
export type ScanMode = "quick" | "full" | "custom" | "realtime";
export type Verdict = "clean" | "suspicious" | "malicious";
export type Severity = "info" | "suspicious" | "malicious";
export type FindingKind =
  | "hashSignature"
  | "yaraRule"
  | "peHeuristic"
  | "archive"
  | "info";

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  title: string;
  detail: string;
  rule: string | null;
}

export interface FileScanResult {
  path: string;
  name: string;
  size: number;
  sha256: string | null;
  verdict: Verdict;
  findings: Finding[];
  durationMs: number;
  error: string | null;
  skipped: boolean;
}

export interface ScanProgress {
  current: number;
  total: number;
  currentPath: string;
  malicious: number;
  suspicious: number;
}

export interface ScanReport {
  id: string;
  mode: ScanMode;
  startedAt: string;
  finishedAt: string;
  scanned: number;
  skipped: number;
  errors: number;
  malicious: number;
  suspicious: number;
  cancelled: boolean;
  results: FileScanResult[];
}

export interface ScanRecord {
  id: string;
  mode: string;
  startedAt: string;
  finishedAt: string;
  scanned: number;
  skipped: number;
  errors: number;
  malicious: number;
  suspicious: number;
  cancelled: boolean;
}

export interface FindingRecord {
  path: string;
  sha256: string | null;
  verdict: Verdict;
  reason: string;
  createdAt: string;
}

export interface QuarantineEntry {
  id: string;
  originalPath: string;
  fileName: string;
  sha256: string | null;
  size: number;
  verdict: Verdict;
  reason: string;
  quarantinedAt: string;
  status: string;
}

export interface ScheduleSettings {
  enabled: boolean;
  frequency: string;
  time: string;
}

export interface AppSettings {
  nickname: string;
  language: string;
  theme: string;
  realtimeEnabled: boolean;
  watchedDirs: string[];
  exclusions: string[];
  maxFileSizeMb: number;
  scanArchives: boolean;
  scheduledScan: ScheduleSettings;
  vtApiKey: string | null;
  onboardingComplete: boolean;
}

export interface AppStats {
  totalScans: number;
  maliciousFound: number;
  suspiciousFound: number;
  quarantinedActive: number;
  lastScanAt: string | null;
}

export interface EventRecord {
  id: number;
  kind: string;
  severity: string;
  message: string;
  createdAt: string;
}

export interface ReputationResult {
  url: string;
  host: string;
  verdict: Verdict;
  matches: string[];
  source: string;
}

export interface VtReputation {
  status: string;
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
}

export interface ReputationCheck {
  local: ReputationResult;
  vt: VtReputation | null;
}

export interface BootstrapData {
  settings: AppSettings;
  stats: AppStats;
  quarantine: QuarantineEntry[];
  scans: ScanRecord[];
  events: EventRecord[];
  appVersion: string;
  yaraRules: number;
  signatures: number;
  realtimeActive: boolean;
  realtimeError: string | null;
  vtConfigured: boolean;
  dataDir: string;
}

export interface ScanStartedEvent {
  mode: string;
  scheduled?: boolean;
}

export interface ThreatEvent {
  entry: QuarantineEntry;
  result: FileScanResult;
}
