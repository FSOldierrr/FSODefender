//! Uygulama durumu ve gerçek zamanlı koruma köprüsü.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, MutexGuard};

use fsod_core::engine::{ScanConfig, ScanEngine};
use fsod_core::models::{AppSettings, FileScanResult, QuarantineEntry};
use fsod_core::quarantine::QuarantineManager;
use fsod_core::realtime::{start_realtime, ProtectionSink, RealtimeGuard};
use fsod_core::reputation::UrlBlacklist;
use fsod_core::signatures::{HashSignatures, YaraRules};
use fsod_core::storage::Storage;
use fsod_core::paths;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

/// Aktif taramanın iptal bayrağı ve çalışma durumu.
pub struct ScanSlot {
    pub running: bool,
    pub cancel: Option<Arc<AtomicBool>>,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub storage: Arc<Storage>,
    pub quarantine: Arc<QuarantineManager>,
    pub hashes: Arc<HashSignatures>,
    pub yara: Arc<YaraRules>,
    pub blacklist: UrlBlacklist,
    pub settings: Mutex<AppSettings>,
    pub scan: Mutex<ScanSlot>,
    pub realtime: Mutex<Option<RealtimeGuard>>,
    pub realtime_error: Mutex<Option<String>>,
    pub last_scheduled: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> fsod_core::Result<Self> {
        paths::ensure_dir(&data_dir)?;
        let storage = Arc::new(Storage::open(&paths::db_path(&data_dir))?);
        let settings = storage.load_settings().unwrap_or_else(|err| {
            tracing::warn!(error = %err, "ayarlar okunamadı, varsayılanlar kullanılıyor");
            AppSettings::default()
        });
        let quarantine = Arc::new(QuarantineManager::new(Arc::clone(&storage), &data_dir)?);
        // İmza güncellemeleri uygulama yeniden derlenmeden uygulanabilsin.
        let hashes = Arc::new(HashSignatures::load_with_external(&data_dir)?);
        let yara = Arc::new(YaraRules::bundled()?);

        Ok(Self {
            data_dir,
            storage,
            quarantine,
            hashes,
            yara,
            blacklist: UrlBlacklist::bundled(),
            settings: Mutex::new(settings),
            scan: Mutex::new(ScanSlot {
                running: false,
                cancel: None,
            }),
            realtime: Mutex::new(None),
            realtime_error: Mutex::new(None),
            last_scheduled: Mutex::new(None),
        })
    }

    pub fn current_settings(&self) -> AppSettings {
        lock(&self.settings).clone()
    }

    pub fn is_scanning(&self) -> bool {
        lock(&self.scan).running
    }

    /// Geçerli ayarlarla tarama motoru üretir. Uygulama verisi ve karantina her zaman dışlanır.
    pub fn engine_with_exclusions(
        &self,
        settings: &AppSettings,
        extra_exclusions: &[String],
    ) -> ScanEngine {
        let mut exclusions = settings.exclusions.clone();
        exclusions.push(self.data_dir.to_string_lossy().into_owned());
        exclusions.push(self.quarantine.dir().to_string_lossy().into_owned());
        exclusions.extend_from_slice(extra_exclusions);

        ScanEngine::new(
            Arc::clone(&self.hashes),
            Arc::clone(&self.yara),
            ScanConfig {
                max_file_size: settings.max_file_size_bytes(),
                scan_archives: settings.scan_archives,
                exclusions,
            },
        )
    }
}

/// Mutex kilidi; zehirlenmiş kilitlerde panik yerine içeriği kurtarır.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Gerçek zamanlı koruma olaylarını Tauri olaylarına çevirir.
pub struct TauriSink {
    pub app: AppHandle,
}

impl ProtectionSink for TauriSink {
    fn on_threat(&self, entry: &QuarantineEntry, result: &FileScanResult) {
        if let Some(state) = self.app.try_state::<AppState>() {
            let _ = state.storage.log_event(
                "threat",
                "malicious",
                &format!("{}: {}", entry.original_path, entry.reason),
            );
        }
        let _ = self
            .app
            .emit("protection:threat", json!({ "entry": entry, "result": result }));
    }

    fn on_activity(&self, message: &str) {
        let _ = self.app.emit("protection:activity", message);
    }

    fn on_error(&self, message: &str) {
        let _ = self.app.emit("protection:error", message);
    }
}

/// Gerçek zamanlı korumayı durdurup güncel ayarlarla yeniden başlatır.
pub fn restart_realtime(app: &AppHandle, state: &AppState) -> Result<(), String> {
    if let Some(guard) = lock(&state.realtime).take() {
        guard.stop();
    }
    *lock(&state.realtime_error) = None;

    let settings = state.current_settings();
    if !settings.realtime_enabled || !settings.onboarding_complete {
        return Ok(());
    }

    let dirs: Vec<PathBuf> = settings
        .watched_dirs
        .iter()
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .collect();

    let engine = Arc::new(state.engine_with_exclusions(&settings, &[]));
    let sink = Arc::new(TauriSink { app: app.clone() });

    match start_realtime(dirs, engine, Arc::clone(&state.quarantine), sink) {
        Ok(guard) => {
            *lock(&state.realtime) = Some(guard);
            Ok(())
        }
        Err(err) => {
            let message = err.to_string();
            *lock(&state.realtime_error) = Some(message.clone());
            Err(message)
        }
    }
}
