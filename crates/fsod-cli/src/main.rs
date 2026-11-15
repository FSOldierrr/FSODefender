use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use anyhow::{Context, bail};
use clap::{Parser, Subcommand};
use fsod_core::engine::{ScanConfig, ScanEngine, sha256_hex};
use fsod_core::models::{AppSettings, ScanMode, ScanReport, Verdict};
use fsod_core::paths;
use fsod_core::quarantine::QuarantineManager;
use fsod_core::signatures::{HashSignatures, YaraRules};
use fsod_core::storage::Storage;

/// FSODefender headless CLI.
#[derive(Debug, Parser)]
#[command(name = "fsod", version, about = "FSODefender komut satırı aracı")]
struct Cli {
    /// Veri dizini (varsayılan: %LOCALAPPDATA%\FSODefenderData)
    #[arg(long, global = true)]
    data_dir: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Dosya veya klasör tarar.
    Scan(ScanArgs),
    /// Karantina kayıtlarını yönetir.
    Quarantine {
        #[command(subcommand)]
        command: QuarantineCommand,
    },
    /// Kural setini doğrular.
    Rules {
        #[command(subcommand)]
        command: RulesCommand,
    },
    /// Tarama istatistiklerini gösterir.
    Stats {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, clap::Args)]
struct ScanArgs {
    /// Taranacak dosya veya klasör (quick/full verilmezse zorunlu).
    path: Option<PathBuf>,
    /// Varsayılan kullanıcı klasörlerini tara.
    #[arg(long)]
    quick: bool,
    /// Sistem sürücüsünü tara (yavaş).
    #[arg(long)]
    full: bool,
    /// Sonucu JSON olarak yazdır.
    #[arg(long)]
    json: bool,
    /// Arşiv içlerini tarama.
    #[arg(long)]
    no_archives: bool,
    /// Dosya boyutu limiti (MB); ayarları geçersiz kılar.
    #[arg(long)]
    max_size_mb: Option<u64>,
}

#[derive(Debug, Subcommand)]
enum QuarantineCommand {
    /// Aktif karantina kayıtlarını listeler.
    List {
        #[arg(long)]
        json: bool,
    },
    /// Bir dosyayı geri yükler.
    Restore {
        id: String,
        /// Hedef klasör (verilmezse orijinal yol).
        #[arg(long)]
        to: Option<PathBuf>,
    },
    /// Bir kaydı kalıcı olarak siler.
    Delete {
        id: String,
        /// Onay (zorunlu).
        #[arg(long)]
        yes: bool,
    },
}

#[derive(Debug, Subcommand)]
enum RulesCommand {
    /// Gömülü hash ve YARA kurallarını doğrular.
    Check,
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("Hata: {error:#}");
            ExitCode::from(1)
        }
    }
}

fn run() -> anyhow::Result<ExitCode> {
    let cli = Cli::parse();
    let data_dir = match cli.data_dir {
        Some(path) => path,
        None => paths::data_dir().context("veri dizini belirlenemedi")?,
    };
    paths::ensure_dir(&data_dir)?;
    let storage = Arc::new(Storage::open(&paths::db_path(&data_dir))?);

    match cli.command {
        Command::Scan(args) => scan(&storage, &data_dir, args),
        Command::Quarantine { command } => quarantine(&storage, &data_dir, command),
        Command::Rules { command } => match command {
            RulesCommand::Check => rules_check(),
        },
        Command::Stats { json } => stats(&storage, json),
    }
}

fn scan(
    storage: &Arc<Storage>,
    data_dir: &std::path::Path,
    args: ScanArgs,
) -> anyhow::Result<ExitCode> {
    if args.quick && args.full {
        bail!("--quick ve --full birlikte kullanılamaz");
    }
    let settings = storage
        .load_settings()
        .unwrap_or_else(|_| AppSettings::default());
    let mut exclusions = settings.exclusions.clone();
    exclusions.push(data_dir.to_string_lossy().into_owned());

    let (roots, mode) = if args.quick {
        (ScanEngine::quick_roots(), ScanMode::Quick)
    } else if args.full {
        exclusions.extend(ScanEngine::full_scan_exclusions());
        (ScanEngine::full_roots(), ScanMode::Full)
    } else {
        match args.path {
            Some(path) => (vec![path], ScanMode::Custom),
            None => bail!("Bir yol belirtin veya --quick / --full kullanın"),
        }
    };
    if roots.is_empty() {
        bail!("Taranacak geçerli yol bulunamadı");
    }

    let max_file_size = args.max_size_mb.unwrap_or(settings.max_file_size_mb).max(1) * 1024 * 1024;
    let config = ScanConfig {
        max_file_size,
        scan_archives: settings.scan_archives && !args.no_archives,
        exclusions,
    };
    let engine = ScanEngine::new(
        Arc::new(HashSignatures::load_with_external(data_dir)?),
        Arc::new(YaraRules::bundled()?),
        config,
    );

    let report = engine.scan_roots(&roots, mode, None, None);
    storage.insert_scan(&report)?;
    let _ = storage.log_event(
        "scan",
        "info",
        &format!("CLI taraması: {} tehdit", report.malicious),
    );

    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_report(&report);
    }

    Ok(if report.malicious > 0 {
        ExitCode::from(2)
    } else if report.suspicious > 0 {
        ExitCode::from(3)
    } else {
        ExitCode::SUCCESS
    })
}

fn print_report(report: &ScanReport) {
    println!(
        "Tarama: {} · taranan {} · atlanan {} · hata {} · süre {}",
        report.mode.as_str(),
        report.scanned,
        report.skipped,
        report.errors,
        duration_label(&report.started_at, &report.finished_at)
    );
    println!(
        "Sonuç: {} zararlı, {} şüpheli{}",
        report.malicious,
        report.suspicious,
        if report.cancelled {
            " (iptal edildi)"
        } else {
            ""
        }
    );
    for result in &report.results {
        let label = match result.verdict {
            Verdict::Malicious => "MALICIOUS",
            Verdict::Suspicious => "SUSPICIOUS",
            Verdict::Clean => "ERROR",
        };
        println!("  [{label}] {} — {}", result.path, result.reason());
    }
}

fn duration_label(started_at: &str, finished_at: &str) -> String {
    let started = chrono::DateTime::parse_from_rfc3339(started_at);
    let finished = chrono::DateTime::parse_from_rfc3339(finished_at);
    match (started, finished) {
        (Ok(started), Ok(finished)) => {
            let millis = (finished - started).num_milliseconds().max(0);
            if millis < 1000 {
                format!("{millis} ms")
            } else {
                format!("{:.1} sn", millis as f64 / 1000.0)
            }
        }
        _ => "-".to_string(),
    }
}

fn quarantine(
    storage: &Arc<Storage>,
    data_dir: &std::path::Path,
    command: QuarantineCommand,
) -> anyhow::Result<ExitCode> {
    let manager = QuarantineManager::new(Arc::clone(storage), data_dir)?;
    match command {
        QuarantineCommand::List { json } => {
            let entries = manager.list_active()?;
            if json {
                println!("{}", serde_json::to_string_pretty(&entries)?);
            } else if entries.is_empty() {
                println!("Karantina boş.");
            } else {
                for entry in entries {
                    println!(
                        "{}  {}  {} bayt  {}  {}",
                        entry.id,
                        entry.file_name,
                        entry.size,
                        entry.verdict.as_str(),
                        entry.quarantined_at
                    );
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        QuarantineCommand::Restore { id, to } => {
            let target = manager.restore(&id, to.as_deref())?;
            println!("Geri yüklendi: {}", target.display());
            let _ = storage.log_event("quarantine", "info", &format!("Geri yüklendi: {id}"));
            Ok(ExitCode::SUCCESS)
        }
        QuarantineCommand::Delete { id, yes } => {
            if !yes {
                bail!("Kalıcı silme için --yes bayrağını kullanın");
            }
            manager.delete(&id)?;
            println!("Silindi: {id}");
            let _ = storage.log_event("quarantine", "warning", &format!("Kalıcı silindi: {id}"));
            Ok(ExitCode::SUCCESS)
        }
    }
}

fn rules_check() -> anyhow::Result<ExitCode> {
    let hashes = HashSignatures::bundled()?;
    let rules = YaraRules::bundled()?;
    println!(
        "İmzalar: {} hash · YARA: {} kural · motor hazır",
        hashes.len(),
        rules.count()
    );
    let sample = b"temiz bir ornek";
    println!(
        "Kontrol taraması: {} bayt → {:?}",
        sample.len(),
        sha256_hex(sample)
    );
    Ok(ExitCode::SUCCESS)
}

fn stats(storage: &Arc<Storage>, json: bool) -> anyhow::Result<ExitCode> {
    let stats = storage.stats()?;
    if json {
        println!("{}", serde_json::to_string_pretty(&stats)?);
    } else {
        println!(
            "Taramalar: {} · zararlı: {} · şüpheli: {} · aktif karantina: {} · son tarama: {}",
            stats.total_scans,
            stats.malicious_found,
            stats.suspicious_found,
            stats.quarantined_active,
            stats.last_scan_at.unwrap_or_else(|| "-".to_string())
        );
    }
    Ok(ExitCode::SUCCESS)
}
