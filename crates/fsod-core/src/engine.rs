//! Tarama orkestrasyonu: dosya gezme, katmanlı tespit, arşiv taraması, ilerleme ve iptal.

use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::heuristics;
use crate::models::{
    FileScanResult, Finding, FindingKind, ScanMode, ScanProgress, ScanReport, Severity, Verdict,
    now_iso,
};
use crate::signatures::{HashSignatures, YaraRules, signature_finding, yara_finding};

pub const MAX_ARCHIVE_ENTRIES: usize = 10_000;
pub const MAX_ENTRY_SIZE: u64 = 64 * 1024 * 1024;
pub const MAX_ARCHIVE_TOTAL: u64 = 512 * 1024 * 1024;
pub const MAX_ARCHIVE_DEPTH: usize = 2;
pub const MAX_NESTED_ARCHIVES: usize = 64;

const DEFAULT_MAX_FILE_SIZE: u64 = 256 * 1024 * 1024;

/// Bir dosya taraması boyunca tüm iç içe arşivlerin paylaştığı bütçe.
struct ScanBudget<'a> {
    decompressed: u64,
    entries: usize,
    nested: usize,
    cancelled: bool,
    cancel: Option<&'a AtomicBool>,
}

impl<'a> ScanBudget<'a> {
    fn new(cancel: Option<&'a AtomicBool>) -> Self {
        Self {
            decompressed: 0,
            entries: 0,
            nested: 0,
            cancelled: false,
            cancel,
        }
    }

    fn check_cancel(&mut self) -> bool {
        if self
            .cancel
            .map(|flag| flag.load(Ordering::Relaxed))
            .unwrap_or(false)
        {
            self.cancelled = true;
        }
        self.cancelled
    }

    fn remaining(&self) -> u64 {
        MAX_ARCHIVE_TOTAL.saturating_sub(self.decompressed)
    }

    fn charge(&mut self, bytes: u64) -> bool {
        let Some(next) = self.decompressed.checked_add(bytes) else {
            return false;
        };
        if next > MAX_ARCHIVE_TOTAL {
            return false;
        }
        self.decompressed = next;
        true
    }

    fn take_entry_slot(&mut self, count: usize) -> bool {
        let Some(next) = self.entries.checked_add(count) else {
            return false;
        };
        if next > MAX_ARCHIVE_ENTRIES {
            return false;
        }
        self.entries = next;
        true
    }
}

/// Tarama davranışını belirleyen ayarlar.
#[derive(Debug, Clone)]
pub struct ScanConfig {
    pub max_file_size: u64,
    pub scan_archives: bool,
    pub exclusions: Vec<String>,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            max_file_size: DEFAULT_MAX_FILE_SIZE,
            scan_archives: true,
            exclusions: Vec::new(),
        }
    }
}

/// Katmanlı tarama motoru. `Arc<ScanEngine>` paylaşılabilir; iç durum değişmez.
pub struct ScanEngine {
    hashes: Arc<HashSignatures>,
    yara: Arc<YaraRules>,
    config: ScanConfig,
}

impl ScanEngine {
    pub fn new(hashes: Arc<HashSignatures>, yara: Arc<YaraRules>, config: ScanConfig) -> Self {
        Self {
            hashes,
            yara,
            config,
        }
    }

    pub fn config(&self) -> &ScanConfig {
        &self.config
    }

    pub fn set_config(&mut self, config: ScanConfig) {
        self.config = config;
    }

    /// Ayar dışlamalarına göre yolun atlanıp atlanmayacağı.
    pub fn is_excluded(&self, path: &Path) -> bool {
        let candidate = normalize_path(&path.to_string_lossy());
        self.config
            .exclusions
            .iter()
            .map(|entry| normalize_path(entry))
            .filter(|entry| !entry.is_empty())
            .any(|entry| candidate == entry || candidate.starts_with(&(entry + "\\")))
    }

    /// Tek bir dosyayı tarar. Disk hatası durumunda `error` alanı dolu döner.
    pub fn scan_file(&self, path: &Path) -> FileScanResult {
        self.scan_file_inner(path, None)
    }

    fn scan_file_inner(
        &self,
        path: &Path,
        cancel: Option<&AtomicBool>,
    ) -> FileScanResult {
        let started = Instant::now();
        let display = path.to_string_lossy().into_owned();
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default();

        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(err) => {
                return FileScanResult::error(path, format!("Dosya okunamadı: {err}"));
            }
        };

        if metadata.file_type().is_symlink() {
            return skipped_result(&display, &name, 0, "Symbolic link skipped");
        }
        if !metadata.is_file() {
            return skipped_result(&display, &name, 0, "Not a regular file");
        }
        if metadata.len() > self.config.max_file_size {
            return skipped_result(
                &display,
                &name,
                metadata.len(),
                &format!(
                    "File larger than the configured limit ({} MB)",
                    self.config.max_file_size / (1024 * 1024)
                ),
            );
        }

        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(err) => {
                return FileScanResult::error(path, format!("Dosya okunamadı: {err}"));
            }
        };

        let sha256 = sha256_hex(&bytes);
        let mut findings = Vec::new();
        let mut budget = ScanBudget::new(cancel);
        self.inspect_bytes(
            &display,
            &bytes,
            0,
            Some(&sha256),
            &mut budget,
            &mut findings,
        );
        let verdict = verdict_from_findings(&findings);

        FileScanResult {
            path: display,
            name,
            size: bytes.len() as u64,
            sha256: Some(sha256),
            verdict,
            findings,
            duration_ms: started.elapsed().as_millis() as u64,
            error: None,
            skipped: false,
        }
    }

    /// Verilen kökleri (dosya veya klasör) tarar ve özet rapor üretir.
    pub fn scan_roots(
        &self,
        roots: &[PathBuf],
        mode: ScanMode,
        cancel: Option<&AtomicBool>,
        progress: Option<&dyn Fn(ScanProgress)>,
    ) -> ScanReport {
        let started_at = now_iso();
        let mut files: Vec<PathBuf> = Vec::new();
        let mut errors: u64 = 0;
        let mut cancelled = false;

        'roots: for root in roots {
            if cancel
                .map(|flag| flag.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                cancelled = true;
                break;
            }
            if self.is_excluded(root) {
                continue;
            }
            let metadata = match fs::symlink_metadata(root) {
                Ok(metadata) => metadata,
                Err(_) => {
                    errors += 1;
                    continue;
                }
            };
            if metadata.file_type().is_file() {
                files.push(root.clone());
                continue;
            }
            if !metadata.is_dir() {
                continue;
            }
            let walker = WalkDir::new(root)
                .follow_links(false)
                .into_iter()
                .filter_entry(|entry| !self.is_excluded(entry.path()));
            for entry in walker {
                if cancel
                    .map(|flag| flag.load(Ordering::Relaxed))
                    .unwrap_or(false)
                {
                    cancelled = true;
                    break 'roots;
                }
                match entry {
                    Ok(entry) => {
                        if entry.file_type().is_file() {
                            files.push(entry.into_path());
                        }
                    }
                    Err(_) => errors += 1,
                }
            }
        }

        let total = files.len() as u64;
        let mut scanned: u64 = 0;
        let mut skipped: u64 = 0;
        let mut malicious: u64 = 0;
        let mut suspicious: u64 = 0;
        let mut results: Vec<FileScanResult> = Vec::new();

        if let Some(callback) = progress {
            callback(ScanProgress {
                current: 0,
                total,
                current_path: String::new(),
                malicious,
                suspicious,
            });
        }

        for (index, path) in files.iter().enumerate() {
            if cancel
                .map(|flag| flag.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                cancelled = true;
                break;
            }

            let result = self.scan_file_inner(path, cancel);
            scanned += 1;
            if result.skipped {
                skipped += 1;
            }
            if result.error.is_some() {
                errors += 1;
            }
            match result.verdict {
                Verdict::Malicious => malicious += 1,
                Verdict::Suspicious => suspicious += 1,
                Verdict::Clean => {}
            }
            let current_path = result.path.clone();
            if result.verdict != Verdict::Clean || result.error.is_some() || result.skipped {
                results.push(result);
            }

            if let Some(callback) = progress {
                callback(ScanProgress {
                    current: (index as u64) + 1,
                    total,
                    current_path,
                    malicious,
                    suspicious,
                });
            }

            if cancel
                .map(|flag| flag.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                cancelled = true;
                break;
            }
        }

        ScanReport {
            id: uuid::Uuid::new_v4().to_string(),
            mode,
            started_at,
            finished_at: now_iso(),
            scanned,
            skipped,
            errors,
            malicious,
            suspicious,
            cancelled,
            results,
        }
    }

    fn inspect_bytes(
        &self,
        display: &str,
        bytes: &[u8],
        depth: usize,
        sha256: Option<&str>,
        budget: &mut ScanBudget<'_>,
        out: &mut Vec<Finding>,
    ) {
        if budget.check_cancel() {
            return;
        }

        let start = out.len();
        let computed_sha;
        let sha = match sha256 {
            Some(value) => value,
            None => {
                computed_sha = sha256_hex(bytes);
                &computed_sha
            }
        };

        if let Some(info) = self.hashes.lookup(sha) {
            out.push(signature_finding(info, sha));
        }

        match self.yara.scan(bytes) {
            Ok(matches) => {
                for matched in &matches {
                    out.push(yara_finding(matched));
                }
            }
            Err(err) => {
                // Tarama yapılamadıysa dosyayı temiz sayma; kullanıcıya görünür bir uyarı bırak.
                out.push(Finding::new(
                    FindingKind::Info,
                    Severity::Suspicious,
                    "YARA scan error",
                    err.to_string(),
                    None,
                ));
            }
        }

        for finding in heuristics::analyze(bytes) {
            out.push(finding);
        }

        if depth > 0 {
            for finding in &mut out[start..] {
                finding.detail = format!("{display}: {}", finding.detail);
            }
        }

        if self.config.scan_archives && is_zip(bytes) {
            if depth < MAX_ARCHIVE_DEPTH {
                self.scan_zip(display, bytes, depth, budget, out);
            } else {
                out.push(archive_limit_finding(
                    display,
                    "Maximum archive nesting depth reached; nested archive was not scanned"
                        .to_string(),
                ));
            }
        }
    }

    fn scan_zip(
        &self,
        display: &str,
        bytes: &[u8],
        depth: usize,
        budget: &mut ScanBudget<'_>,
        out: &mut Vec<Finding>,
    ) {
        budget.nested += 1;
        if budget.nested > MAX_NESTED_ARCHIVES {
            out.push(archive_limit_finding(
                display,
                format!("Nested archive limit reached ({MAX_NESTED_ARCHIVES})"),
            ));
            return;
        }

        let cursor = Cursor::new(bytes);
        let mut archive = match zip::ZipArchive::new(cursor) {
            Ok(archive) => archive,
            Err(err) => {
                out.push(Finding::new(
                    FindingKind::Archive,
                    Severity::Suspicious,
                    "Archive could not be opened",
                    format!("{display}: {err}"),
                    None,
                ));
                return;
            }
        };

        let entry_count = archive.len();
        if !budget.take_entry_slot(entry_count) {
            out.push(archive_limit_finding(
                display,
                format!(
                    "Archive contains {entry_count} entries; total entry limit is {MAX_ARCHIVE_ENTRIES}"
                ),
            ));
            return;
        }

        for index in 0..entry_count {
            if budget.check_cancel() {
                break;
            }
            if budget.remaining() == 0 {
                out.push(archive_limit_finding(
                    display,
                    "Total uncompressed archive size limit reached".to_string(),
                ));
                break;
            }

            let mut entry = match archive.by_index(index) {
                Ok(entry) => entry,
                Err(_) => {
                    out.push(Finding::new(
                        FindingKind::Archive,
                        Severity::Suspicious,
                        "Unreadable archive entry",
                        format!("{display}: entry #{index} could not be read"),
                        None,
                    ));
                    continue;
                }
            };
            if entry.is_dir() {
                continue;
            }

            let entry_name = match entry.name() {
                Ok(name) => name.into_owned(),
                Err(_) => format!("entry_{index}"),
            };
            let declared_size = entry.size();
            let allowance = MAX_ENTRY_SIZE.min(budget.remaining());

            if declared_size > allowance {
                out.push(archive_limit_finding(
                    display,
                    format!("Entry '{entry_name}' exceeds the archive size budget"),
                ));
                continue;
            }

            let mut buffer = Vec::new();
            if let Err(err) = entry
                .by_ref()
                .take(allowance.saturating_add(1))
                .read_to_end(&mut buffer)
            {
                out.push(Finding::new(
                    FindingKind::Archive,
                    Severity::Suspicious,
                    "Unreadable archive entry",
                    format!("{display}!{entry_name}: {err}"),
                    None,
                ));
                continue;
            }
            if budget.check_cancel() {
                break;
            }
            if buffer.len() as u64 > allowance {
                out.push(archive_limit_finding(
                    display,
                    format!("Entry '{entry_name}' exceeds the archive size budget"),
                ));
                continue;
            }
            if !budget.charge(buffer.len() as u64) {
                out.push(archive_limit_finding(
                    display,
                    "Total uncompressed archive size limit reached".to_string(),
                ));
                break;
            }

            let inner_display = format!("{display}!{entry_name}");
            self.inspect_bytes(
                &inner_display,
                &buffer,
                depth + 1,
                None,
                budget,
                out,
            );
        }
    }

    /// Varsayılan hızlı tarama kökleri: Masaüstü, İndirilenler, Belgeler.
    pub fn quick_roots() -> Vec<PathBuf> {
        crate::paths::default_watch_dirs()
            .into_iter()
            .map(PathBuf::from)
            .filter(|path| path.exists())
            .collect()
    }

    /// Tam tarama kökü: sistem sürücüsü.
    pub fn full_roots() -> Vec<PathBuf> {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        let root = PathBuf::from(format!("{drive}\\"));
        if root.exists() {
            vec![root]
        } else {
            Vec::new()
        }
    }

    /// Tam taramada atlanması önerilen sistem klasörleri.
    pub fn full_scan_exclusions() -> Vec<String> {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        vec![
            format!("{drive}\\Windows\\WinSxS"),
            format!("{drive}\\System Volume Information"),
            format!("{drive}\\$Recycle.Bin"),
        ]
    }
}

fn skipped_result(display: &str, name: &str, size: u64, reason: &str) -> FileScanResult {
    FileScanResult {
        path: display.to_string(),
        name: name.to_string(),
        size,
        sha256: None,
        verdict: Verdict::Clean,
        findings: vec![Finding::new(
            FindingKind::Info,
            Severity::Info,
            "File skipped",
            reason.to_string(),
            None,
        )],
        duration_ms: 0,
        error: None,
        skipped: true,
    }
}

fn archive_limit_finding(display: &str, reason: String) -> Finding {
    Finding::new(
        FindingKind::Archive,
        Severity::Suspicious,
        "Archive limits exceeded",
        format!("{display}: {reason}"),
        None,
    )
}

fn verdict_from_findings(findings: &[Finding]) -> Verdict {
    findings
        .iter()
        .map(|finding| match finding.severity {
            Severity::Malicious => Verdict::Malicious,
            Severity::Suspicious => Verdict::Suspicious,
            Severity::Info => Verdict::Clean,
        })
        .max()
        .unwrap_or(Verdict::Clean)
}

fn normalize_path(value: &str) -> String {
    value
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn is_zip(bytes: &[u8]) -> bool {
    if bytes.starts_with(b"PK\x03\x04") {
        return true;
    }
    // Prepended veri içeren (self-extracting/polyglot) ZIP'lerde yerel başlık
    // dosyanın başında olmayabilir; EOCD imzasını son 64 KiB içinde ara.
    let tail_len = bytes.len().min(65_557);
    bytes[bytes.len() - tail_len..]
        .windows(4)
        .any(|window| window == b"PK\x05\x06")
}

/// Bir bayt dizisinin küçük harfli SHA-256 özeti.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    const MARKER_RULE: &str = r#"
        rule malware_fsod_test_marker : malicious test {
            strings:
                $marker = "FSOD_TEST_MALWARE_MARKER_12345"
            condition:
                $marker
        }
    "#;

    fn test_engine(max_file_size: u64) -> ScanEngine {
        ScanEngine::new(
            Arc::new(HashSignatures::bundled().unwrap()),
            Arc::new(YaraRules::compile(&[MARKER_RULE]).unwrap()),
            ScanConfig {
                max_file_size,
                scan_archives: true,
                exclusions: Vec::new(),
            },
        )
    }

    #[test]
    fn eicar_hash_matches_known_value() {
        // Test örneği parçalardan üretilir; kaynak dosyası AV tarafından kendi kendine tespit edilmez.
        let eicar = [
            b"X5O!P%@AP[".as_slice(),
            b"4\\PZX54(P^)7",
            b"CC)7}$EICAR-STANDARD-",
            b"ANTIVIRUS-TEST-FILE!$H+H*",
        ]
        .concat();
        assert_eq!(
            sha256_hex(&eicar),
            "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"
        );
    }

    #[test]
    fn clean_file_has_no_findings() {
        let engine = test_engine(1024 * 1024);
        let mut findings = Vec::new();
        let mut budget = ScanBudget::new(None);
        engine.inspect_bytes(
            "memory",
            b"just some clean text",
            0,
            None,
            &mut budget,
            &mut findings,
        );
        assert!(findings.is_empty());
    }

    #[test]
    fn yara_marker_is_malicious() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("marker.bin");
        fs::write(&path, b"prefix FSOD_TEST_MALWARE_MARKER_12345 suffix").unwrap();
        let engine = test_engine(1024 * 1024);
        let result = engine.scan_file(&path);
        assert_eq!(result.verdict, Verdict::Malicious);
        assert!(
            result
                .findings
                .iter()
                .any(|f| f.severity == Severity::Malicious)
        );
    }

    #[test]
    fn zip_content_is_scanned() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("sample.zip");
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            writer
                .start_file("payload.txt", zip::write::SimpleFileOptions::default())
                .unwrap();
            writer
                .write_all(b"inside FSOD_TEST_MALWARE_MARKER_12345 archive")
                .unwrap();
            writer.finish().unwrap();
        }
        fs::write(&path, cursor.into_inner()).unwrap();

        let engine = test_engine(1024 * 1024);
        let result = engine.scan_file(&path);
        assert_eq!(result.verdict, Verdict::Malicious);
        assert!(
            result
                .findings
                .iter()
                .any(|f| f.detail.contains("sample.zip!payload.txt"))
        );
    }

    #[test]
    fn archive_scanning_can_be_disabled() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("sample.zip");
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            writer
                .start_file("payload.txt", zip::write::SimpleFileOptions::default())
                .unwrap();
            writer
                .write_all(b"inside FSOD_TEST_MALWARE_MARKER_12345 archive")
                .unwrap();
            writer.finish().unwrap();
        }
        fs::write(&path, cursor.into_inner()).unwrap();

        let engine = ScanEngine::new(
            Arc::new(HashSignatures::bundled().unwrap()),
            Arc::new(YaraRules::compile(&[MARKER_RULE]).unwrap()),
            ScanConfig {
                max_file_size: 1024 * 1024,
                scan_archives: false,
                exclusions: Vec::new(),
            },
        );
        let result = engine.scan_file(&path);
        assert_eq!(result.verdict, Verdict::Clean);
    }

    #[test]
    fn oversized_file_is_skipped() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("big.bin");
        fs::write(&path, vec![0u8; 128]).unwrap();
        let engine = test_engine(16);
        let result = engine.scan_file(&path);
        assert!(result.skipped);
        assert_eq!(result.verdict, Verdict::Clean);
    }

    #[test]
    fn scan_roots_counts_results() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("clean.txt"), b"hello").unwrap();
        fs::write(
            dir.path().join("bad.bin"),
            b"FSOD_TEST_MALWARE_MARKER_12345",
        )
        .unwrap();

        let engine = test_engine(1024 * 1024);
        let report = engine.scan_roots(&[dir.path().to_path_buf()], ScanMode::Custom, None, None);
        assert_eq!(report.scanned, 2);
        assert_eq!(report.malicious, 1);
        assert_eq!(report.results.len(), 1);
        assert!(report.results[0].path.ends_with("bad.bin"));
    }

    #[test]
    fn exclusions_are_respected() {
        let engine = ScanEngine::new(
            Arc::new(HashSignatures::bundled().unwrap()),
            Arc::new(YaraRules::bundled().unwrap()),
            ScanConfig {
                exclusions: vec![r"C:\Temp\skip".to_string()],
                ..ScanConfig::default()
            },
        );
        assert!(engine.is_excluded(Path::new(r"C:\Temp\skip")));
        assert!(engine.is_excluded(Path::new(r"C:\Temp\skip\file.txt")));
        assert!(!engine.is_excluded(Path::new(r"C:\Temp\keep\file.txt")));
    }
}
