//! Tauri komutları: arayüz ile çekirdek arasındaki tek köprü.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use fsod_core::engine::ScanEngine;
use fsod_core::error::user_message;
use fsod_core::models::{
    AppSettings, AppStats, EventRecord, FindingRecord, QuarantineEntry, ReputationResult,
    ScanMode, ScanRecord, ScanReport, Verdict,
};
use fsod_core::reputation::{VirusTotalClient, VtReputation};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::state::{lock, restart_realtime, AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: AppSettings,
    pub stats: AppStats,
    pub quarantine: Vec<QuarantineEntry>,
    pub scans: Vec<ScanRecord>,
    pub events: Vec<EventRecord>,
    pub app_version: String,
    pub yara_rules: usize,
    pub signatures: usize,
    pub realtime_active: bool,
    pub realtime_error: Option<String>,
    pub vt_configured: bool,
    pub data_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationCheck {
    pub local: ReputationResult,
    pub vt: Option<VtReputation>,
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> Result<Bootstrap, String> {
    let settings = state.current_settings();
    let stats = state.storage.stats().map_err(|err| user_message(&err))?;
    let quarantine = state
        .quarantine
        .list_active()
        .map_err(|err| user_message(&err))?;
    let scans = state
        .storage
        .list_scans(25)
        .map_err(|err| user_message(&err))?;
    let events = state
        .storage
        .list_events(60)
        .map_err(|err| user_message(&err))?;
    let vt_configured = settings
        .vt_api_key
        .as_deref()
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false);

    Ok(Bootstrap {
        settings,
        stats,
        quarantine,
        scans,
        events,
        app_version: fsod_core::APP_VERSION.to_string(),
        yara_rules: state.yara.count(),
        signatures: state.hashes.len(),
        realtime_active: lock(&state.realtime).is_some(),
        realtime_error: lock(&state.realtime_error).clone(),
        vt_configured,
        data_dir: state.data_dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    mut settings: AppSettings,
) -> Result<AppSettings, String> {
    sanitize_settings(&mut settings);
    let previous = state.current_settings();
    state
        .storage
        .save_settings(&settings)
        .map_err(|err| user_message(&err))?;
    *lock(&state.settings) = settings.clone();
    let _ = state
        .storage
        .log_event("settings", "info", "Ayarlar güncellendi");

    // Tema/dil gibi değişiklikler için korumayı durdurmaya gerek yok.
    if realtime_config_changed(&previous, &settings) {
        let _ = restart_realtime(&app, &state);
    }
    let _ = app.emit("settings:changed", &settings);
    Ok(settings)
}

/// Koruma motorunu yeniden başlatmayı gerektiren ayar değişiklikleri.
fn realtime_config_changed(previous: &AppSettings, next: &AppSettings) -> bool {
    previous.realtime_enabled != next.realtime_enabled
        || previous.onboarding_complete != next.onboarding_complete
        || previous.watched_dirs != next.watched_dirs
        || previous.exclusions != next.exclusions
        || previous.max_file_size_mb != next.max_file_size_mb
        || previous.scan_archives != next.scan_archives
}

#[tauri::command]
pub fn complete_onboarding(
    app: AppHandle,
    state: State<'_, AppState>,
    nickname: String,
    language: String,
    realtime_enabled: Option<bool>,
) -> Result<AppSettings, String> {
    let nickname: String = nickname.trim().chars().take(40).collect();
    if nickname.is_empty() {
        return Err("Lütfen bir nick girin".to_string());
    }

    let mut settings = state.current_settings();
    settings.nickname = nickname;
    settings.language = if language == "en" { "en" } else { "tr" }.to_string();
    if let Some(enabled) = realtime_enabled {
        settings.realtime_enabled = enabled;
    }
    settings.onboarding_complete = true;

    state
        .storage
        .save_settings(&settings)
        .map_err(|err| user_message(&err))?;
    *lock(&state.settings) = settings.clone();
    match restart_realtime(&app, &state) {
        Ok(()) => {
            let _ = state
                .storage
                .log_event("app", "info", "Kurulum tamamlandı, koruma başlatıldı");
        }
        Err(err) => {
            let _ = state
                .storage
                .log_event("app", "warning", &format!("Koruma başlatılamadı: {err}"));
        }
    }
    Ok(settings)
}

#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: String,
    path: Option<String>,
) -> Result<ScanReport, String> {
    let settings = state.current_settings();
    let scan_mode = match mode.as_str() {
        "quick" => ScanMode::Quick,
        "full" => ScanMode::Full,
        "custom" => ScanMode::Custom,
        other => return Err(format!("Geçersiz tarama modu: {other}")),
    };

    let (roots, extra_exclusions) = match scan_mode {
        ScanMode::Quick => (ScanEngine::quick_roots(), Vec::new()),
        ScanMode::Full => (
            ScanEngine::full_roots(),
            ScanEngine::full_scan_exclusions(),
        ),
        ScanMode::Custom => {
            let raw = path.ok_or_else(|| "Taramak için bir dosya veya klasör seçin".to_string())?;
            let candidate = PathBuf::from(raw);
            if !candidate.exists() {
                return Err("Seçilen yol bulunamadı".to_string());
            }
            (vec![candidate], Vec::new())
        }
        ScanMode::Realtime => {
            return Err("Gerçek zamanlı mod manuel tarama için kullanılamaz".to_string())
        }
    };
    if roots.is_empty() {
        return Err("Taranacak geçerli klasör bulunamadı".to_string());
    }

    let cancel = {
        let mut slot = lock(&state.scan);
        if slot.running {
            return Err("Zaten bir tarama çalışıyor".to_string());
        }
        slot.running = true;
        let cancel = Arc::new(AtomicBool::new(false));
        slot.cancel = Some(Arc::clone(&cancel));
        cancel
    };

    let engine = state.engine_with_exclusions(&settings, &extra_exclusions);
    let storage = Arc::clone(&state.storage);
    let _ = app.emit(
        "scan:started",
        serde_json::json!({ "mode": scan_mode.as_str(), "scheduled": false }),
    );

    let result = execute_scan(app, storage, engine, roots, scan_mode, cancel).await;

    {
        let mut slot = lock(&state.scan);
        slot.running = false;
        slot.cancel = None;
    }

    result
}

async fn execute_scan(
    app: AppHandle,
    storage: Arc<fsod_core::storage::Storage>,
    engine: ScanEngine,
    roots: Vec<PathBuf>,
    mode: ScanMode,
    cancel: Arc<AtomicBool>,
) -> Result<ScanReport, String> {
    let progress_app = app.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        let report = engine.scan_roots(
            &roots,
            mode,
            Some(&cancel),
            Some(&|progress| {
                let _ = progress_app.emit("scan:progress", &progress);
            }),
        );
        let severity = if report.malicious > 0 {
            "warning"
        } else {
            "info"
        };
        let _ = storage.insert_scan(&report);
        let _ = storage.log_event(
            "scan",
            severity,
            &format!(
                "Tarama tamamlandı: {} zararlı, {} şüpheli",
                report.malicious, report.suspicious
            ),
        );
        report
    })
    .await
    .map_err(|err| format!("Tarama işçisi hatası: {err}"))?;

    let _ = app.emit("scan:finished", &report);
    Ok(report)
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> Result<bool, String> {
    let slot = lock(&state.scan);
    if let Some(cancel) = &slot.cancel {
        cancel.store(true, Ordering::Relaxed);
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn realtime_status(state: State<'_, AppState>) -> bool {
    lock(&state.realtime).is_some()
}

#[tauri::command]
pub fn retry_realtime(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    restart_realtime(&app, &state)?;
    Ok(lock(&state.realtime).is_some())
}

/// Manuel tarama sonucundaki bir dosyayı kullanıcı onayıyla karantinaya alır.
/// Dosya yeniden taranır; yalnızca güncel verdict `Malicious` ise kasaya taşınır.
#[tauri::command]
pub fn quarantine_scan_result(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<QuarantineEntry, String> {
    let candidate = PathBuf::from(&path);
    if !candidate.is_file() {
        return Err("Dosya bulunamadı veya artık erişilemiyor.".to_string());
    }

    let settings = state.current_settings();
    let engine = state.engine_with_exclusions(&settings, &[]);
    let result = engine.scan_file(&candidate);
    if result.skipped {
        return Err("Dosya boyut sınırı nedeniyle taranamadı; karantinaya alınmadı.".to_string());
    }
    if result.verdict != Verdict::Malicious {
        return Err(
            "Dosya yeniden tarandı ve artık zararlı olarak sınıflandırılmadı; karantinaya alınmadı."
                .to_string(),
        );
    }

    let reason = result
        .findings
        .iter()
        .filter(|finding| finding.severity == fsod_core::models::Severity::Malicious)
        .map(|finding| finding.title.clone())
        .collect::<Vec<_>>()
        .join("; ");
    let reason = if reason.is_empty() {
        "Manuel tarama tespiti".to_string()
    } else {
        reason
    };

    let entry = state
        .quarantine
        .quarantine_file(&candidate, Verdict::Malicious, &reason)
        .map_err(|err| user_message(&err))?;
    let _ = state.storage.log_event(
        "quarantine",
        "malicious",
        &format!("{}: {}", entry.original_path, entry.reason),
    );
    let _ = app.emit("quarantine:changed", ());
    let _ = app.emit("protection:activity", "Manuel tarama sonucu karantinaya alındı");
    Ok(entry)
}

#[tauri::command]
pub fn quarantine_list(state: State<'_, AppState>) -> Result<Vec<QuarantineEntry>, String> {
    state
        .quarantine
        .list_active()
        .map_err(|err| user_message(&err))
}

#[tauri::command]
pub fn quarantine_restore(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    target_dir: Option<String>,
) -> Result<String, String> {
    let target = target_dir.map(PathBuf::from);
    let restored = state
        .quarantine
        .restore(&id, target.as_deref())
        .map_err(|err| user_message(&err))?;
    let _ = state.storage.log_event(
        "quarantine",
        "info",
        &format!("Geri yüklendi: {}", restored.display()),
    );
    let _ = app.emit("quarantine:changed", ());
    Ok(restored.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn quarantine_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state
        .quarantine
        .delete(&id)
        .map_err(|err| user_message(&err))?;
    let _ = state
        .storage
        .log_event("quarantine", "warning", &format!("Karantinadan silindi: {id}"));
    let _ = app.emit("quarantine:changed", ());
    Ok(())
}

#[tauri::command]
pub fn scan_history(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<ScanRecord>, String> {
    state
        .storage
        .list_scans(limit.unwrap_or(25).clamp(1, 200))
        .map_err(|err| user_message(&err))
}

#[tauri::command]
pub fn scan_findings(
    state: State<'_, AppState>,
    scan_id: String,
) -> Result<Vec<FindingRecord>, String> {
    state
        .storage
        .list_findings(&scan_id)
        .map_err(|err| user_message(&err))
}

#[tauri::command]
pub fn activity_events(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<EventRecord>, String> {
    state
        .storage
        .list_events(limit.unwrap_or(60).clamp(1, 500))
        .map_err(|err| user_message(&err))
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> Result<AppStats, String> {
    state.storage.stats().map_err(|err| user_message(&err))
}

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&state.data_dir)
            .spawn()
            .map_err(|err| format!("Klasör açılamadı: {err}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        Err("Bu özellik yalnızca Windows'ta desteklenir".to_string())
    }
}

#[tauri::command]
pub async fn check_url(
    state: State<'_, AppState>,
    url: String,
    use_vt: Option<bool>,
) -> Result<ReputationCheck, String> {
    let local = state
        .blacklist
        .check(&url)
        .map_err(|err| user_message(&err))?;

    let mut vt = None;
    if use_vt.unwrap_or(false) {
        let settings = state.current_settings();
        let client = VirusTotalClient::new(settings.vt_api_key);
        if !client.configured() {
            return Err("VirusTotal API anahtarı yapılandırılmadı".to_string());
        }
        let result = client
            .check_url(&local.url)
            .await
            .map_err(|err| user_message(&err))?;
        vt = Some(result);
    }

    Ok(ReputationCheck { local, vt })
}

fn sanitize_settings(settings: &mut AppSettings) {
    settings.nickname = settings.nickname.trim().chars().take(40).collect();
    if settings.onboarding_complete && settings.nickname.is_empty() {
        settings.nickname = "Kullanıcı".to_string();
    }
    settings.language = if settings.language == "en" { "en" } else { "tr" }.to_string();
    settings.theme = match settings.theme.as_str() {
        "light" => "light",
        "system" => "system",
        _ => "dark",
    }
    .to_string();
    settings.max_file_size_mb = settings.max_file_size_mb.clamp(1, 4096);
    settings.watched_dirs = dedupe(std::mem::take(&mut settings.watched_dirs));
    settings.exclusions = dedupe(std::mem::take(&mut settings.exclusions));
    let schedule = &mut settings.scheduled_scan;
    schedule.frequency = if schedule.frequency == "weekly" {
        "weekly"
    } else {
        "daily"
    }
    .to_string();
    if !is_valid_time(&schedule.time) {
        schedule.time = "03:00".to_string();
    }
    settings.vt_api_key = settings
        .vt_api_key
        .take()
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty());
}

fn dedupe(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .collect()
}

fn is_valid_time(value: &str) -> bool {
    if value.len() != 5 || value.as_bytes().get(2) != Some(&b':') {
        return false;
    }
    let hour: u32 = value[0..2].parse().unwrap_or(99);
    let minute: u32 = value[3..5].parse().unwrap_or(99);
    hour < 24 && minute < 60
}
