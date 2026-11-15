//! Şifreli karantina kasası.
//!
//! - Anahtar 32 bayttır ve Windows DPAPI ile korunur.
//! - Her dosya XChaCha20-Poly1305 ile şifrelenir; nonce blob'un başına eklenir.
//! - Meta veri SQLite'ta tutulur; geri yükleme yalnızca açık kullanıcı aksiyonuyla olur.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};

use crate::dpapi;
use crate::engine::sha256_hex;
use crate::error::{Error, Result};
use crate::models::{QuarantineEntry, Verdict, now_iso};
use crate::paths;
use crate::storage::Storage;

const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;

pub struct QuarantineManager {
    storage: Arc<Storage>,
    dir: PathBuf,
    key: [u8; KEY_LEN],
}

impl QuarantineManager {
    pub fn new(storage: Arc<Storage>, data_dir: &Path) -> Result<Self> {
        let dir = paths::quarantine_dir(data_dir);
        paths::ensure_dir(&dir)?;
        let key = load_or_create_key(&paths::key_path(data_dir))?;
        Ok(Self { storage, dir, key })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Dosyayı şifreleyip kasaya taşır. Orijinal dosya ancak kasa yazımı başarılıysa silinir.
    pub fn quarantine_file(
        &self,
        path: &Path,
        verdict: Verdict,
        reason: &str,
    ) -> Result<QuarantineEntry> {
        let bytes = fs::read(path)?;
        let sha256 = sha256_hex(&bytes);
        let id = uuid::Uuid::new_v4().to_string();
        let blob = self.encrypt(&bytes)?;
        let blob_path = self.dir.join(format!("{id}.bin"));
        fs::write(&blob_path, &blob)?;

        if let Err(err) = fs::remove_file(path) {
            let _ = fs::remove_file(&blob_path);
            return Err(err.into());
        }

        let entry = QuarantineEntry {
            id: id.clone(),
            original_path: path.to_string_lossy().into_owned(),
            file_name: path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "unknown".to_string()),
            sha256: Some(sha256),
            size: bytes.len() as u64,
            verdict,
            reason: truncate_reason(reason),
            quarantined_at: now_iso(),
            status: "quarantined".to_string(),
        };

        if let Err(err) = self.storage.insert_quarantine(&entry) {
            // Meta veri yazılamazsa dosyayı yerine koy; veri kaybı olmasın.
            // Geri yazma başarısız olursa şifreli blob'u koruyoruz ki dosya kurtarılabilsin.
            match fs::write(path, &bytes) {
                Ok(()) => {
                    let _ = fs::remove_file(&blob_path);
                }
                Err(restore_err) => {
                    tracing::error!(
                        error = %restore_err,
                        blob = %blob_path.display(),
                        "karantina geri yazılamadı; şifreli kopya korunuyor"
                    );
                }
            }
            return Err(err);
        }

        tracing::info!(id = %id, file = %path.display(), "dosya karantinaya alındı");
        Ok(entry)
    }

    pub fn list(&self) -> Result<Vec<QuarantineEntry>> {
        self.storage.list_quarantine()
    }

    pub fn list_active(&self) -> Result<Vec<QuarantineEntry>> {
        Ok(self
            .storage
            .list_quarantine()?
            .into_iter()
            .filter(|entry| entry.status == "quarantined")
            .collect())
    }

    /// Karantinadaki dosyayı geri yükler. Hedef yoksa orijinal yol kullanılır.
    pub fn restore(&self, id: &str, target_dir: Option<&Path>) -> Result<PathBuf> {
        let entry = self
            .storage
            .get_quarantine(id)?
            .ok_or_else(|| Error::Invalid("Karantina kaydı bulunamadı".to_string()))?;
        if entry.status != "quarantined" {
            return Err(Error::Invalid(
                "Bu kayıt artık karantinada değil".to_string(),
            ));
        }

        let blob_path = self.dir.join(format!("{id}.bin"));
        let blob = fs::read(&blob_path)?;
        let plain = self.decrypt(&blob)?;

        let original = PathBuf::from(&entry.original_path);
        let target = match target_dir {
            Some(dir) => dir.join(&entry.file_name),
            None => original,
        };
        let target = unique_path(&target);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&target, &plain)?;

        if let Err(err) = fs::remove_file(&blob_path) {
            tracing::warn!(error = %err, "karantina blob'u silinemedi");
        }
        self.storage.update_quarantine_status(id, "restored")?;
        tracing::info!(id = %id, target = %target.display(), "dosya geri yüklendi");
        Ok(target)
    }

    /// Karantina kaydını kalıcı olarak siler (yalnızca açık onayla çağrılmalı).
    pub fn delete(&self, id: &str) -> Result<()> {
        let entry = self
            .storage
            .get_quarantine(id)?
            .ok_or_else(|| Error::Invalid("Karantina kaydı bulunamadı".to_string()))?;
        if entry.status != "quarantined" {
            return Err(Error::Invalid(
                "Bu kayıt artık karantinada değil".to_string(),
            ));
        }
        let blob_path = self.dir.join(format!("{id}.bin"));
        if blob_path.exists() {
            fs::remove_file(&blob_path)?;
        }
        self.storage.update_quarantine_status(id, "deleted")?;
        tracing::info!(id = %id, "karantina kaydı silindi");
        Ok(())
    }

    fn cipher(&self) -> Result<XChaCha20Poly1305> {
        XChaCha20Poly1305::new_from_slice(&self.key)
            .map_err(|_| Error::Crypto("geçersiz anahtar uzunluğu".to_string()))
    }

    fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        let cipher = self.cipher()?;
        let nonce_bytes: [u8; NONCE_LEN] = rand::random();
        let ciphertext = cipher
            .encrypt(XNonce::from_slice(&nonce_bytes), plaintext)
            .map_err(|_| Error::Crypto("şifreleme başarısız".to_string()))?;
        let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        blob.extend_from_slice(&nonce_bytes);
        blob.extend_from_slice(&ciphertext);
        Ok(blob)
    }

    fn decrypt(&self, blob: &[u8]) -> Result<Vec<u8>> {
        if blob.len() <= NONCE_LEN {
            return Err(Error::Crypto("bozuk karantina dosyası".to_string()));
        }
        let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
        let cipher = self.cipher()?;
        cipher
            .decrypt(XNonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|_| {
                Error::Crypto("karantina çözülemedi (anahtar veya veri bozuk)".to_string())
            })
    }
}

fn load_or_create_key(path: &Path) -> Result<[u8; KEY_LEN]> {
    if path.exists() {
        let blob = fs::read(path)?;
        let raw = dpapi::unprotect(&blob)?;
        if raw.len() != KEY_LEN {
            return Err(Error::Crypto("anahtar boyutu geçersiz".to_string()));
        }
        let mut key = [0u8; KEY_LEN];
        key.copy_from_slice(&raw);
        return Ok(key);
    }

    let key: [u8; KEY_LEN] = rand::random();
    let protected = dpapi::protect(&key)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, protected)?;
    Ok(key)
}

fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string());
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().into_owned());
    for index in 1..10_000 {
        let candidate = match &extension {
            Some(ext) => parent.join(format!("{stem} ({index}).{ext}")),
            None => parent.join(format!("{stem} ({index})")),
        };
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem}-{}", uuid::Uuid::new_v4()))
}

fn truncate_reason(reason: &str) -> String {
    const MAX: usize = 2000;
    if reason.len() <= MAX {
        return reason.to_string();
    }
    let mut end = MAX;
    while !reason.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &reason[..end])
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn manager() -> (tempfile::TempDir, QuarantineManager) {
        let dir = tempdir().unwrap();
        let storage = Arc::new(Storage::open(&paths::db_path(dir.path())).unwrap());
        let manager = QuarantineManager::new(storage, dir.path()).unwrap();
        (dir, manager)
    }

    #[test]
    fn quarantine_and_restore_roundtrip() {
        let (dir, manager) = manager();
        let original = dir.path().join("sample.bin");
        let payload = b"karantina test verisi";
        fs::write(&original, payload).unwrap();

        let entry = manager
            .quarantine_file(&original, Verdict::Malicious, "test")
            .unwrap();
        assert!(!original.exists());
        assert_eq!(manager.list_active().unwrap().len(), 1);
        assert!(manager.dir().join(format!("{}.bin", entry.id)).exists());

        let restored = manager.restore(&entry.id, None).unwrap();
        assert_eq!(restored, original);
        assert_eq!(fs::read(&restored).unwrap(), payload);
        assert_eq!(manager.list_active().unwrap().len(), 0);
    }

    #[test]
    fn restore_does_not_overwrite_existing_file() {
        let (dir, manager) = manager();
        let original = dir.path().join("sample.bin");
        fs::write(&original, b"orijinal").unwrap();
        let entry = manager
            .quarantine_file(&original, Verdict::Malicious, "test")
            .unwrap();

        fs::write(&original, b"yeni dosya").unwrap();
        let restored = manager.restore(&entry.id, None).unwrap();
        assert_ne!(restored, original);
        assert_eq!(fs::read(&restored).unwrap(), b"orijinal");
        assert_eq!(fs::read(&original).unwrap(), b"yeni dosya");
    }

    #[test]
    fn tampered_blob_cannot_be_restored() {
        let (dir, manager) = manager();
        let original = dir.path().join("sample.bin");
        fs::write(&original, b"veri").unwrap();
        let entry = manager
            .quarantine_file(&original, Verdict::Malicious, "test")
            .unwrap();

        let blob_path = manager.dir().join(format!("{}.bin", entry.id));
        let mut blob = fs::read(&blob_path).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        fs::write(&blob_path, blob).unwrap();

        assert!(manager.restore(&entry.id, None).is_err());
    }

    #[test]
    fn delete_removes_blob() {
        let (dir, manager) = manager();
        let original = dir.path().join("sample.bin");
        fs::write(&original, b"veri").unwrap();
        let entry = manager
            .quarantine_file(&original, Verdict::Malicious, "test")
            .unwrap();

        manager.delete(&entry.id).unwrap();
        assert!(!manager.dir().join(format!("{}.bin", entry.id)).exists());
        assert!(manager.list_active().unwrap().is_empty());
    }
}
