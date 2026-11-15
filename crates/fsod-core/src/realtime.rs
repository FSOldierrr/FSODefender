//! Gerçek zamanlı dosya koruması: klasör izleme + debounce + otomatik karantina.
//!
//! Uygulama açıkken çalışır (v1). Windows servisi olarak arka plan koruması v2 kapsamındadır.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::event::{AccessKind, AccessMode};
use notify::{EventKind, RecursiveMode, Watcher};

use crate::engine::ScanEngine;
use crate::error::{Error, Result};
use crate::models::{FileScanResult, QuarantineEntry, Verdict};
use crate::quarantine::QuarantineManager;

const DEBOUNCE: Duration = Duration::from_millis(500);
const POLL_INTERVAL: Duration = Duration::from_millis(150);

/// Gerçek zamanlı koruma olaylarını UI katmanına taşıyan arayüz.
pub trait ProtectionSink: Send + Sync {
    fn on_threat(&self, entry: &QuarantineEntry, result: &FileScanResult);
    fn on_activity(&self, message: &str);
    fn on_error(&self, message: &str);
}

/// Durdurulabilir gerçek zamanlı koruma tutamacı.
pub struct RealtimeGuard {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl RealtimeGuard {
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for RealtimeGuard {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// İzlemeyi başlatır. Klasörler yoksa sessizce atlanır; en az bir klasör izlenmelidir.
pub fn start_realtime(
    dirs: Vec<PathBuf>,
    engine: Arc<ScanEngine>,
    quarantine: Arc<QuarantineManager>,
    sink: Arc<dyn ProtectionSink>,
) -> Result<RealtimeGuard> {
    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let _ = tx.send(result);
    })
    .map_err(|err| Error::Invalid(format!("Dosya izleyici başlatılamadı: {err}")))?;

    let mut watched = 0usize;
    for dir in &dirs {
        if dir.exists() {
            watcher
                .watch(dir, RecursiveMode::Recursive)
                .map_err(|err| Error::Invalid(format!("Klasör izlenemedi: {err}")))?;
            watched += 1;
        }
    }
    if watched == 0 {
        return Err(Error::Invalid(
            "İzlenecek geçerli klasör bulunamadı".to_string(),
        ));
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let handle = thread::spawn(move || {
        // Watcher thread sonunda düşer; kapanışta izleme temizlenir.
        let _watcher = watcher;
        let mut pending: HashMap<PathBuf, Instant> = HashMap::new();

        loop {
            if stop_thread.load(Ordering::Relaxed) {
                break;
            }

            match rx.recv_timeout(POLL_INTERVAL) {
                Ok(Ok(event)) => {
                    if is_relevant(&event.kind) {
                        for path in event.paths {
                            if should_consider(&path, &engine) {
                                pending.insert(path, Instant::now());
                            }
                        }
                    }
                }
                Ok(Err(err)) => sink.on_error(&format!("İzleyici hatası: {err}")),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            let now = Instant::now();
            let due: Vec<PathBuf> = pending
                .iter()
                .filter(|(_, seen)| now.duration_since(**seen) >= DEBOUNCE)
                .map(|(path, _)| path.clone())
                .collect();
            for path in due {
                pending.remove(&path);
                if stop_thread.load(Ordering::Relaxed) {
                    break;
                }
                process_file(&path, &engine, &quarantine, sink.as_ref());
            }
        }
    });

    Ok(RealtimeGuard {
        stop,
        handle: Some(handle),
    })
}

fn is_relevant(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Modify(_)
            | EventKind::Any
            | EventKind::Access(AccessKind::Close(AccessMode::Write))
    )
}

fn should_consider(path: &Path, engine: &ScanEngine) -> bool {
    if engine.is_excluded(path) || !path.is_file() {
        return false;
    }
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    !matches!(
        extension.as_str(),
        "tmp" | "temp" | "part" | "partial" | "crdownload"
    )
}

fn process_file(
    path: &Path,
    engine: &ScanEngine,
    quarantine: &QuarantineManager,
    sink: &dyn ProtectionSink,
) {
    let result = engine.scan_file(path);
    if let Some(error) = &result.error {
        sink.on_error(&format!("{}: {error}", path.display()));
        return;
    }

    match result.verdict {
        Verdict::Malicious => {
            match quarantine.quarantine_file(path, result.verdict, &result.reason()) {
                Ok(entry) => sink.on_threat(&entry, &result),
                Err(err) => {
                    sink.on_error(&format!("{} karantinaya alınamadı: {err}", path.display()))
                }
            }
        }
        Verdict::Suspicious => {
            sink.on_activity(&format!("Şüpheli dosya: {}", path.display()));
        }
        Verdict::Clean => {}
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::engine::{ScanConfig, ScanEngine};
    use crate::paths;
    use crate::signatures::{HashSignatures, YaraRules};
    use crate::storage::Storage;
    use std::fs;
    use std::sync::Mutex;
    use tempfile::tempdir;

    const MARKER_RULE: &str = r#"
        rule malware_fsod_realtime_marker : malicious test {
            strings:
                $marker = "FSOD_REALTIME_MARKER_98765"
            condition:
                $marker
        }
    "#;

    struct ChannelSink {
        threats: Mutex<mpsc::Sender<QuarantineEntry>>,
        errors: Mutex<Vec<String>>,
    }

    impl ProtectionSink for ChannelSink {
        fn on_threat(&self, entry: &QuarantineEntry, _result: &FileScanResult) {
            let _ = self.threats.lock().unwrap().send(entry.clone());
        }

        fn on_activity(&self, _message: &str) {}

        fn on_error(&self, message: &str) {
            self.errors.lock().unwrap().push(message.to_string());
        }
    }

    #[test]
    fn detects_and_quarantines_new_file() {
        let watch_dir = tempdir().unwrap();
        let data_dir = tempdir().unwrap();

        let storage = Arc::new(Storage::open(&paths::db_path(data_dir.path())).unwrap());
        let quarantine = Arc::new(QuarantineManager::new(storage, data_dir.path()).unwrap());
        let engine = Arc::new(ScanEngine::new(
            Arc::new(HashSignatures::bundled().unwrap()),
            Arc::new(YaraRules::compile(&[MARKER_RULE]).unwrap()),
            ScanConfig::default(),
        ));

        let (tx, rx) = mpsc::channel();
        let sink = Arc::new(ChannelSink {
            threats: Mutex::new(tx),
            errors: Mutex::new(Vec::new()),
        });

        let guard = start_realtime(
            vec![watch_dir.path().to_path_buf()],
            Arc::clone(&engine),
            Arc::clone(&quarantine),
            sink.clone(),
        )
        .unwrap();

        thread::sleep(Duration::from_millis(150));
        let target = watch_dir.path().join("dropped.bin");
        fs::write(&target, b"FSOD_REALTIME_MARKER_98765").unwrap();

        let entry = rx
            .recv_timeout(Duration::from_secs(6))
            .expect("gerçek zamanlı tespit zaman aşımına uğradı");
        assert_eq!(entry.verdict, Verdict::Malicious);
        assert!(!target.exists());
        assert_eq!(quarantine.list_active().unwrap().len(), 1);

        guard.stop();
        assert!(sink.errors.lock().unwrap().is_empty());
    }

    #[test]
    fn clean_file_is_not_quarantined() {
        let watch_dir = tempdir().unwrap();
        let data_dir = tempdir().unwrap();

        let storage = Arc::new(Storage::open(&paths::db_path(data_dir.path())).unwrap());
        let quarantine = Arc::new(QuarantineManager::new(storage, data_dir.path()).unwrap());
        let engine = Arc::new(ScanEngine::new(
            Arc::new(HashSignatures::bundled().unwrap()),
            Arc::new(YaraRules::compile(&[MARKER_RULE]).unwrap()),
            ScanConfig::default(),
        ));
        let (tx, _rx) = mpsc::channel();
        let sink = Arc::new(ChannelSink {
            threats: Mutex::new(tx),
            errors: Mutex::new(Vec::new()),
        });

        let guard = start_realtime(
            vec![watch_dir.path().to_path_buf()],
            engine,
            Arc::clone(&quarantine),
            sink,
        )
        .unwrap();

        thread::sleep(Duration::from_millis(150));
        let target = watch_dir.path().join("clean.txt");
        fs::write(&target, b"merhaba dunya").unwrap();
        thread::sleep(Duration::from_millis(1200));

        assert!(target.exists());
        assert!(quarantine.list_active().unwrap().is_empty());
        guard.stop();
    }

    #[test]
    fn partial_download_extensions_are_ignored() {
        let engine = Arc::new(ScanEngine::new(
            Arc::new(HashSignatures::bundled().unwrap()),
            Arc::new(YaraRules::bundled().unwrap()),
            ScanConfig::default(),
        ));
        let dir = tempdir().unwrap();
        let partial = dir.path().join("file.crdownload");
        fs::write(&partial, b"x").unwrap();
        assert!(!should_consider(&partial, &engine));
    }
}
