mod commands;
mod state;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

use fsod_core::engine::ScanEngine;
use fsod_core::models::ScanMode;
use fsod_core::paths;
use serde_json::json;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use state::{lock, restart_realtime, AppState};

fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new("fsod_core=info,fsodefender_lib=info")
    });
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = paths::data_dir()?;
            let state = AppState::new(data_dir)?;
            let settings = state.current_settings();
            app.manage(state);

            setup_tray(app)?;
            setup_window(app)?;

            if settings.onboarding_complete && settings.realtime_enabled {
                let handle = app.handle().clone();
                let managed = app.state::<AppState>();
                if let Err(err) = restart_realtime(&handle, &managed) {
                    tracing::warn!(error = %err, "gerçek zamanlı koruma başlatılamadı");
                }
            }

            spawn_scheduler(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_settings,
            commands::complete_onboarding,
            commands::start_scan,
            commands::cancel_scan,
            commands::quarantine_scan_result,
            commands::realtime_status,
            commands::retry_realtime,
            commands::quarantine_list,
            commands::quarantine_restore,
            commands::quarantine_delete,
            commands::scan_history,
            commands::scan_findings,
            commands::activity_events,
            commands::get_stats,
            commands::open_data_dir,
            commands::check_url,
        ])
        .run(tauri::generate_context!())
        .expect("FSODefender başlatılamadı");
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Göster / Show", true, None::<&str>)?;
    let quick = MenuItem::with_id(
        app,
        "quick_scan",
        "Hızlı Tara / Quick Scan",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış / Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quick, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("FSODefender")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "quick_scan" => {
                show_main(app);
                let _ = app.emit("tray:quick-scan", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_window(app: &mut tauri::App) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let handle = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = handle.hide();
            }
        });
    }
    Ok(())
}

/// Zamanlanmış taramaları yürüten hafif arka plan iş parçacığı.
fn spawn_scheduler(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(20));

        let state = app.state::<AppState>();
        let settings = state.current_settings();
        if !settings.onboarding_complete || !settings.scheduled_scan.enabled {
            continue;
        }

        let now = chrono::Local::now();
        if settings.scheduled_scan.time != now.format("%H:%M").to_string() {
            continue;
        }
        if settings.scheduled_scan.frequency == "weekly" && now.format("%u").to_string() != "1" {
            continue;
        }
        if state.is_scanning() {
            continue;
        }

        let today = now.format("%Y-%m-%d").to_string();
        {
            let mut last = lock(&state.last_scheduled);
            if last.as_deref() == Some(today.as_str()) {
                continue;
            }
            *last = Some(today);
        }

        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut slot = lock(&state.scan);
            slot.running = true;
            slot.cancel = Some(Arc::clone(&cancel));
        }

        let engine = state.engine_with_exclusions(&settings, &[]);
        let roots = ScanEngine::quick_roots();
        if roots.is_empty() {
            let mut slot = lock(&state.scan);
            slot.running = false;
            slot.cancel = None;
            continue;
        }

        let _ = app.emit(
            "scan:started",
            json!({ "mode": "quick", "scheduled": true }),
        );

        let progress_app = app.clone();
        let report = engine.scan_roots(
            &roots,
            ScanMode::Quick,
            Some(&cancel),
            Some(&|progress| {
                let _ = progress_app.emit("scan:progress", &progress);
            }),
        );

        let _ = state.storage.insert_scan(&report);
        let _ = state.storage.log_event(
            "schedule",
            "info",
            &format!(
                "Zamanlanmış tarama tamamlandı: {} zararlı",
                report.malicious
            ),
        );
        let _ = app.emit("scan:finished", &report);

        let mut slot = lock(&state.scan);
        slot.running = false;
        slot.cancel = None;
    });
}
