use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{Error, Result};
use crate::models::{
    AppSettings, AppStats, EventRecord, FindingRecord, QuarantineEntry, ScanRecord, ScanReport,
    Verdict, now_iso,
};

#[cfg(windows)]
const SECRET_PREFIX: &str = "dpapi:v1:";

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    data  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
    id          TEXT PRIMARY KEY,
    mode        TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    scanned     INTEGER NOT NULL,
    skipped     INTEGER NOT NULL,
    errors      INTEGER NOT NULL,
    malicious   INTEGER NOT NULL,
    suspicious  INTEGER NOT NULL,
    cancelled   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id    TEXT NOT NULL,
    path       TEXT NOT NULL,
    sha256     TEXT,
    verdict    TEXT NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);

CREATE TABLE IF NOT EXISTS quarantine (
    id            TEXT PRIMARY KEY,
    original_path TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    sha256        TEXT,
    size          INTEGER NOT NULL,
    verdict       TEXT NOT NULL,
    reason        TEXT NOT NULL,
    quarantined_at TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'quarantined'
);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    severity   TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"#;

/// SQLite tabanlı kalıcı depolama. Tek bağlantı, mutex ile korunur.
pub struct Storage {
    conn: Mutex<Connection>,
}

impl Storage {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    // ---------- Ayarlar ----------

    pub fn load_settings(&self) -> Result<AppSettings> {
        let data: Option<String> = self
            .conn()
            .query_row("SELECT data FROM settings WHERE id = 1", [], |row| {
                row.get(0)
            })
            .optional()?;
        match data {
            Some(json) => decode_settings(&json),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let json = encode_settings(settings)?;
        self.conn().execute(
            "INSERT INTO settings (id, data) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![json],
        )?;
        Ok(())
    }

    // ---------- Taramalar ----------

    pub fn insert_scan(&self, report: &ScanReport) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO scans
             (id, mode, started_at, finished_at, scanned, skipped, errors, malicious, suspicious, cancelled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                report.id,
                report.mode.as_str(),
                report.started_at,
                report.finished_at,
                as_i64(report.scanned),
                as_i64(report.skipped),
                as_i64(report.errors),
                as_i64(report.malicious),
                as_i64(report.suspicious),
                if report.cancelled { 1 } else { 0 },
            ],
        )?;
        for result in &report.results {
            tx.execute(
                "INSERT INTO findings (scan_id, path, sha256, verdict, reason, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    report.id,
                    result.path,
                    result.sha256,
                    result.verdict.as_str(),
                    result.reason(),
                    report.finished_at,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_scans(&self, limit: u32) -> Result<Vec<ScanRecord>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, mode, started_at, finished_at, scanned, skipped, errors, malicious, suspicious, cancelled
             FROM scans ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![i64::from(limit)], |row| {
            let cancelled: i64 = row.get(9)?;
            Ok(ScanRecord {
                id: row.get(0)?,
                mode: row.get(1)?,
                started_at: row.get(2)?,
                finished_at: row.get(3)?,
                scanned: row.get::<_, i64>(4)? as u64,
                skipped: row.get::<_, i64>(5)? as u64,
                errors: row.get::<_, i64>(6)? as u64,
                malicious: row.get::<_, i64>(7)? as u64,
                suspicious: row.get::<_, i64>(8)? as u64,
                cancelled: cancelled != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn list_findings(&self, scan_id: &str) -> Result<Vec<FindingRecord>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT path, sha256, verdict, reason, created_at FROM findings
             WHERE scan_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![scan_id], |row| {
            Ok(FindingRecord {
                path: row.get(0)?,
                sha256: row.get(1)?,
                verdict: Verdict::parse(&row.get::<_, String>(2)?),
                reason: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn stats(&self) -> Result<AppStats> {
        let conn = self.conn();
        let (total_scans, malicious_found, suspicious_found, last_scan_at): (
            i64,
            i64,
            i64,
            Option<String>,
        ) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(malicious), 0), COALESCE(SUM(suspicious), 0), MAX(finished_at) FROM scans",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let quarantined_active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM quarantine WHERE status = 'quarantined'",
            [],
            |row| row.get(0),
        )?;
        Ok(AppStats {
            total_scans: total_scans as u64,
            malicious_found: malicious_found as u64,
            suspicious_found: suspicious_found as u64,
            quarantined_active: quarantined_active as u64,
            last_scan_at,
        })
    }

    // ---------- Karantina ----------

    pub fn insert_quarantine(&self, entry: &QuarantineEntry) -> Result<()> {
        self.conn().execute(
            "INSERT INTO quarantine
             (id, original_path, file_name, sha256, size, verdict, reason, quarantined_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                entry.id,
                entry.original_path,
                entry.file_name,
                entry.sha256,
                as_i64(entry.size),
                entry.verdict.as_str(),
                entry.reason,
                entry.quarantined_at,
                entry.status,
            ],
        )?;
        Ok(())
    }

    pub fn list_quarantine(&self) -> Result<Vec<QuarantineEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, original_path, file_name, sha256, size, verdict, reason, quarantined_at, status
             FROM quarantine ORDER BY quarantined_at DESC",
        )?;
        let rows = stmt.query_map([], map_quarantine)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn get_quarantine(&self, id: &str) -> Result<Option<QuarantineEntry>> {
        let entry = self
            .conn()
            .query_row(
                "SELECT id, original_path, file_name, sha256, size, verdict, reason, quarantined_at, status
                 FROM quarantine WHERE id = ?1",
                params![id],
                map_quarantine,
            )
            .optional()?;
        Ok(entry)
    }

    pub fn update_quarantine_status(&self, id: &str, status: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE quarantine SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }

    // ---------- Olaylar ----------

    pub fn log_event(&self, kind: &str, severity: &str, message: &str) -> Result<()> {
        self.conn().execute(
            "INSERT INTO events (kind, severity, message, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![kind, severity, message, now_iso()],
        )?;
        Ok(())
    }

    pub fn list_events(&self, limit: u32) -> Result<Vec<EventRecord>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, kind, severity, message, created_at FROM events ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![i64::from(limit)], |row| {
            Ok(EventRecord {
                id: row.get(0)?,
                kind: row.get(1)?,
                severity: row.get(2)?,
                message: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

/// API anahtarı gibi sırları SQLite'ta düz metin tutmamak için DPAPI ile zarflanır.
fn encode_settings(settings: &AppSettings) -> Result<String> {
    #[cfg(windows)]
    {
        let mut stored = settings.clone();
        if let Some(key) = stored.vt_api_key.take().filter(|key| !key.is_empty()) {
            let protected = crate::dpapi::protect(key.as_bytes())?;
            stored.vt_api_key = Some(format!("{SECRET_PREFIX}{}", hex::encode(protected)));
        }
        Ok(serde_json::to_string(&stored)?)
    }

    #[cfg(not(windows))]
    {
        Ok(serde_json::to_string(settings)?)
    }
}

fn decode_settings(json: &str) -> Result<AppSettings> {
    let mut settings: AppSettings = serde_json::from_str(json)?;

    #[cfg(windows)]
    if let Some(value) = settings.vt_api_key.take() {
        if let Some(encoded) = value.strip_prefix(SECRET_PREFIX) {
            let decoded = hex::decode(encoded)
                .map_err(|err| Error::Crypto(format!("şifreli ayar okunamadı: {err}")))
                .and_then(|blob| crate::dpapi::unprotect(&blob))
                .and_then(|raw| {
                    String::from_utf8(raw)
                        .map_err(|err| Error::Crypto(format!("şifreli ayar geçersiz: {err}")))
                });
            match decoded {
                Ok(key) if !key.is_empty() => settings.vt_api_key = Some(key),
                Ok(_) => {}
                Err(err) => {
                    // Anahtar çözülemezse diğer ayarları kaybetmemek için yalnızca anahtarı düşür.
                    tracing::warn!(error = %err, "kayıtlı API anahtarı çözülemedi");
                }
            }
        } else {
            // Eski sürümlerden kalan düz metin anahtar; bir sonraki kayıtta şifrelenir.
            settings.vt_api_key = Some(value);
        }
    }

    Ok(settings)
}

fn as_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn map_quarantine(row: &rusqlite::Row<'_>) -> rusqlite::Result<QuarantineEntry> {
    Ok(QuarantineEntry {
        id: row.get(0)?,
        original_path: row.get(1)?,
        file_name: row.get(2)?,
        sha256: row.get(3)?,
        size: row.get::<_, i64>(4)? as u64,
        verdict: Verdict::parse(&row.get::<_, String>(5)?),
        reason: row.get(6)?,
        quarantined_at: row.get(7)?,
        status: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{FileScanResult, Finding, FindingKind, ScanMode, Severity};

    fn sample_report() -> ScanReport {
        ScanReport {
            id: "scan-1".to_string(),
            mode: ScanMode::Custom,
            started_at: now_iso(),
            finished_at: now_iso(),
            scanned: 10,
            skipped: 1,
            errors: 0,
            malicious: 1,
            suspicious: 0,
            cancelled: false,
            results: vec![FileScanResult {
                path: r"C:\tmp\bad.exe".to_string(),
                name: "bad.exe".to_string(),
                size: 42,
                sha256: Some("abc".to_string()),
                verdict: Verdict::Malicious,
                findings: vec![Finding::new(
                    FindingKind::HashSignature,
                    Severity::Malicious,
                    "Test",
                    "Test tespiti",
                    None,
                )],
                duration_ms: 1,
                error: None,
                skipped: false,
            }],
        }
    }

    #[test]
    fn settings_roundtrip() {
        let storage = Storage::open_in_memory().unwrap();
        let settings = AppSettings {
            nickname: "kanka".to_string(),
            language: "en".to_string(),
            ..AppSettings::default()
        };
        storage.save_settings(&settings).unwrap();
        let loaded = storage.load_settings().unwrap();
        assert_eq!(loaded.nickname, "kanka");
        assert_eq!(loaded.language, "en");
    }

    #[cfg(windows)]
    #[test]
    fn vt_api_key_is_encrypted_at_rest() {
        let storage = Storage::open_in_memory().unwrap();
        let settings = AppSettings {
            vt_api_key: Some("vt-secret-key-123".to_string()),
            ..AppSettings::default()
        };
        storage.save_settings(&settings).unwrap();

        let raw: String = storage
            .conn()
            .query_row("SELECT data FROM settings WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(!raw.contains("vt-secret-key-123"));
        assert!(raw.contains(SECRET_PREFIX));

        let loaded = storage.load_settings().unwrap();
        assert_eq!(loaded.vt_api_key.as_deref(), Some("vt-secret-key-123"));
    }

    #[test]
    fn scan_and_stats_roundtrip() {
        let storage = Storage::open_in_memory().unwrap();
        storage.insert_scan(&sample_report()).unwrap();
        let scans = storage.list_scans(10).unwrap();
        assert_eq!(scans.len(), 1);
        assert_eq!(scans[0].malicious, 1);
        assert_eq!(storage.stats().unwrap().malicious_found, 1);
    }

    #[test]
    fn quarantine_roundtrip() {
        let storage = Storage::open_in_memory().unwrap();
        let entry = QuarantineEntry {
            id: "q1".to_string(),
            original_path: r"C:\tmp\bad.exe".to_string(),
            file_name: "bad.exe".to_string(),
            sha256: Some("abc".to_string()),
            size: 42,
            verdict: Verdict::Malicious,
            reason: "EICAR".to_string(),
            quarantined_at: now_iso(),
            status: "quarantined".to_string(),
        };
        storage.insert_quarantine(&entry).unwrap();
        assert_eq!(storage.list_quarantine().unwrap().len(), 1);
        storage.update_quarantine_status("q1", "restored").unwrap();
        assert_eq!(
            storage.get_quarantine("q1").unwrap().unwrap().status,
            "restored"
        );
        assert_eq!(storage.stats().unwrap().quarantined_active, 0);
    }

    #[test]
    fn events_are_logged() {
        let storage = Storage::open_in_memory().unwrap();
        storage.log_event("scan", "info", "test").unwrap();
        let events = storage.list_events(10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].message, "test");
    }
}
