//! FSODefender core engine.
//!
//! Platform bağımsız tarama hattı: hash imzaları → YARA kuralları → PE heuristikleri → arşiv taraması.
//! Windows'a özgü tek nokta DPAPI anahtar korumasıdır (`dpapi` modülü).

pub mod dpapi;
pub mod engine;
pub mod error;
pub mod heuristics;
pub mod models;
pub mod paths;
pub mod quarantine;
pub mod realtime;
pub mod reputation;
pub mod signatures;
pub mod storage;

pub use error::{Error, Result};

pub const APP_NAME: &str = "FSODefender";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
