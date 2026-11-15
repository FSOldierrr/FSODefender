use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

/// Uygulama veri dizini. Testler `FSOD_DATA_DIR` ile yönlendirebilir.
pub fn data_dir() -> Result<PathBuf> {
    if let Some(dir) = std::env::var_os("FSOD_DATA_DIR") {
        let path = PathBuf::from(dir);
        if !path.as_os_str().is_empty() {
            return Ok(path);
        }
    }
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        // Kurulum dizini currentUser NSIS ile %LOCALAPPDATA%\FSODefender olabilir;
        // veriyi ayrı tutarak ikili dosya ile kasa anahtarını aynı klasöre koymayız.
        .map(|base| base.join("FSODefenderData"))
        .ok_or(Error::NoDataDir)
}

pub fn ensure_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    Ok(())
}

pub fn db_path(data_dir: &Path) -> PathBuf {
    data_dir.join("fsodefender.db")
}

pub fn quarantine_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("quarantine")
}

pub fn key_path(data_dir: &Path) -> PathBuf {
    data_dir.join("quarantine.key")
}

pub fn user_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

/// Varsayılan gerçek zamanlı izleme klasörleri (yalnızca var olanlar).
pub fn default_watch_dirs() -> Vec<String> {
    let Some(home) = user_home() else {
        return Vec::new();
    };
    ["Desktop", "Downloads", "Documents"]
        .iter()
        .map(|name| home.join(name))
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_stable() {
        let base = PathBuf::from(r"C:\data");
        assert!(db_path(&base).ends_with("fsodefender.db"));
        assert!(quarantine_dir(&base).ends_with("quarantine"));
        assert!(key_path(&base).ends_with("quarantine.key"));
    }
}
