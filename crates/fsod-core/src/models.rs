use serde::{Deserialize, Serialize};

/// Bir dosya veya arşiv girdisi için nihai karar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Clean,
    Suspicious,
    Malicious,
}

impl Verdict {
    pub fn as_str(self) -> &'static str {
        match self {
            Verdict::Clean => "clean",
            Verdict::Suspicious => "suspicious",
            Verdict::Malicious => "malicious",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "malicious" => Verdict::Malicious,
            "suspicious" => Verdict::Suspicious,
            _ => Verdict::Clean,
        }
    }
}

/// Tek bir tespitin ağırlığı.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Suspicious,
    Malicious,
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Info => "info",
            Severity::Suspicious => "suspicious",
            Severity::Malicious => "malicious",
        }
    }
}

/// Tespitin hangi katmandan geldiği.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingKind {
    HashSignature,
    YaraRule,
    PeHeuristic,
    Archive,
    Info,
}

/// Tek bir tespit kaydı. `reason` alanları kullanıcıya şeffaflık için gösterilir.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub kind: FindingKind,
    pub severity: Severity,
    pub title: String,
    pub detail: String,
    pub rule: Option<String>,
}

impl Finding {
    pub fn new(
        kind: FindingKind,
        severity: Severity,
        title: impl Into<String>,
        detail: impl Into<String>,
        rule: Option<String>,
    ) -> Self {
        Self {
            kind,
            severity,
            title: title.into(),
            detail: detail.into(),
            rule,
        }
    }
}

/// Tek bir dosyanın tarama sonucu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileScanResult {
    /// Görüntülenecek yol; arşiv içi girdilerde `arsiv.zip!girdi.exe` biçimindedir.
    pub path: String,
    pub name: String,
    pub size: u64,
    pub sha256: Option<String>,
    pub verdict: Verdict,
    pub findings: Vec<Finding>,
    pub duration_ms: u64,
    pub error: Option<String>,
    /// Boyut limiti nedeniyle taranmadıysa true.
    pub skipped: bool,
}

impl FileScanResult {
    pub fn error(path: &std::path::Path, message: impl Into<String>) -> Self {
        Self {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            size: 0,
            sha256: None,
            verdict: Verdict::Clean,
            findings: Vec::new(),
            duration_ms: 0,
            error: Some(message.into()),
            skipped: false,
        }
    }

    pub fn reason(&self) -> String {
        if let Some(err) = &self.error {
            return err.clone();
        }
        let titles: Vec<&str> = self.findings.iter().map(|f| f.title.as_str()).collect();
        if titles.is_empty() {
            "Tespit yok".to_string()
        } else {
            titles.join(" | ")
        }
    }
}

/// Tarama ilerleme bilgisi (UI ve CLI için).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub current: u64,
    pub total: u64,
    pub current_path: String,
    pub malicious: u64,
    pub suspicious: u64,
}

/// Tarama türü.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScanMode {
    Quick,
    Full,
    Custom,
    Realtime,
}

impl ScanMode {
    pub fn as_str(self) -> &'static str {
        match self {
            ScanMode::Quick => "quick",
            ScanMode::Full => "full",
            ScanMode::Custom => "custom",
            ScanMode::Realtime => "realtime",
        }
    }
}

/// Bir tarama işinin özeti ve (yalnızca temiz olmayan) sonuçları.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub id: String,
    pub mode: ScanMode,
    pub started_at: String,
    pub finished_at: String,
    pub scanned: u64,
    pub skipped: u64,
    pub errors: u64,
    pub malicious: u64,
    pub suspicious: u64,
    pub cancelled: bool,
    pub results: Vec<FileScanResult>,
}

/// Geçmiş listesi için hafif tarama kaydı.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRecord {
    pub id: String,
    pub mode: String,
    pub started_at: String,
    pub finished_at: String,
    pub scanned: u64,
    pub skipped: u64,
    pub errors: u64,
    pub malicious: u64,
    pub suspicious: u64,
    pub cancelled: bool,
}

/// Geçmiş detayı için tek tespit kaydı.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindingRecord {
    pub path: String,
    pub sha256: Option<String>,
    pub verdict: Verdict,
    pub reason: String,
    pub created_at: String,
}

/// Karantina kaydı.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineEntry {
    pub id: String,
    pub original_path: String,
    pub file_name: String,
    pub sha256: Option<String>,
    pub size: u64,
    pub verdict: Verdict,
    pub reason: String,
    pub quarantined_at: String,
    pub status: String,
}

/// Zamanlanmış tarama ayarı.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSettings {
    pub enabled: bool,
    /// `daily` veya `weekly`
    pub frequency: String,
    /// `HH:MM` (24 saat)
    pub time: String,
}

impl Default for ScheduleSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            frequency: "daily".to_string(),
            time: "03:00".to_string(),
        }
    }
}

/// Uygulama ayarları. Tek satır JSON olarak SQLite'ta saklanır.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub nickname: String,
    /// `tr` veya `en`
    pub language: String,
    /// `dark`, `light` veya `system`
    pub theme: String,
    pub realtime_enabled: bool,
    pub watched_dirs: Vec<String>,
    pub exclusions: Vec<String>,
    pub max_file_size_mb: u64,
    pub scan_archives: bool,
    pub scheduled_scan: ScheduleSettings,
    pub vt_api_key: Option<String>,
    pub onboarding_complete: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            nickname: String::new(),
            language: "tr".to_string(),
            theme: "dark".to_string(),
            realtime_enabled: true,
            watched_dirs: crate::paths::default_watch_dirs(),
            exclusions: Vec::new(),
            max_file_size_mb: 256,
            scan_archives: true,
            scheduled_scan: ScheduleSettings::default(),
            vt_api_key: None,
            onboarding_complete: false,
        }
    }
}

impl AppSettings {
    pub fn language(&self) -> &str {
        match self.language.as_str() {
            "en" => "en",
            _ => "tr",
        }
    }

    pub fn max_file_size_bytes(&self) -> u64 {
        self.max_file_size_mb.max(1) * 1024 * 1024
    }
}

/// Dashboard istatistikleri.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppStats {
    pub total_scans: u64,
    pub malicious_found: u64,
    pub suspicious_found: u64,
    pub quarantined_active: u64,
    pub last_scan_at: Option<String>,
}

/// Olay günlüğü kaydı.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecord {
    pub id: i64,
    pub kind: String,
    pub severity: String,
    pub message: String,
    pub created_at: String,
}

/// URL itibar sorgusu sonucu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationResult {
    pub url: String,
    pub host: String,
    pub verdict: Verdict,
    pub matches: Vec<String>,
    pub source: String,
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verdict_ordering_and_parse() {
        assert!(Verdict::Malicious > Verdict::Suspicious);
        assert_eq!(Verdict::parse("malicious"), Verdict::Malicious);
        assert_eq!(Verdict::parse("unknown"), Verdict::Clean);
    }

    #[test]
    fn default_settings_are_sane() {
        let settings = AppSettings::default();
        assert_eq!(settings.language(), "tr");
        assert!(settings.realtime_enabled);
        assert_eq!(settings.max_file_size_bytes(), 256 * 1024 * 1024);
    }
}
