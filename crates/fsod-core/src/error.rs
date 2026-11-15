use std::path::PathBuf;

/// FSODefender çekirdek hata tipi.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("G/Ç hatası: {0}")]
    Io(#[from] std::io::Error),

    #[error("veritabanı hatası: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("JSON hatası: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YARA hatası: {0}")]
    Yara(String),

    #[error("arşiv hatası: {0}")]
    Archive(String),

    #[error("kripto hatası: {0}")]
    Crypto(String),

    #[error("DPAPI hatası: {0}")]
    Dpapi(String),

    #[error("ağ hatası: {0}")]
    Network(String),

    #[error("geçersiz işlem: {0}")]
    Invalid(String),

    #[error("veri dizini bulunamadı (LOCALAPPDATA yok)")]
    NoDataDir,
}

pub type Result<T> = std::result::Result<T, Error>;

/// Hata mesajından kullanıcıya gösterilebilir kısa bir metin üretir.
pub fn user_message(err: &Error) -> String {
    match err {
        Error::Io(e) => format!("Dosya erişim hatası: {e}"),
        Error::Db(e) => format!("Veritabanı hatası: {e}"),
        Error::Json(e) => format!("Veri biçimi hatası: {e}"),
        Error::Yara(e) => format!("Kural hatası: {e}"),
        Error::Archive(e) => format!("Arşiv hatası: {e}"),
        Error::Crypto(e) => format!("Kripto hatası: {e}"),
        Error::Dpapi(e) => format!("Anahtar koruması hatası: {e}"),
        Error::Network(e) => format!("Ağ hatası: {e}"),
        Error::Invalid(e) => e.clone(),
        Error::NoDataDir => "Veri dizini bulunamadı".to_string(),
    }
}

/// Bir yolun var olan üst dizinlerini oluşturur.
pub fn ensure_parent(path: &std::path::Path) -> Result<()> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

/// Test yardımcısı: geçici veri dizini altında yol üretir.
pub fn path_join(base: &std::path::Path, part: &str) -> PathBuf {
    base.join(part)
}
