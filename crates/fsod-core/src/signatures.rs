use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::models::{Finding, FindingKind, Severity};

const SIGNATURES_JSON: &str = include_str!("../../../rules/signatures.json");

/// Veri dizininde gömülü imzalara ek olarak okunan dosya.
pub const EXTERNAL_SIGNATURES_FILE: &str = "signatures.local.json";

const BUNDLED_YARA: &[(&str, &str)] = &[
    ("eicar.yar", include_str!("../../../rules/yara/eicar.yar")),
    (
        "suspicious_scripts.yar",
        include_str!("../../../rules/yara/suspicious_scripts.yar"),
    ),
    (
        "suspicious_office.yar",
        include_str!("../../../rules/yara/suspicious_office.yar"),
    ),
    (
        "suspicious_ransomware.yar",
        include_str!("../../../rules/yara/suspicious_ransomware.yar"),
    ),
    (
        "suspicious_credential.yar",
        include_str!("../../../rules/yara/suspicious_credential.yar"),
    ),
];

/// İki dilli açıklama.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LocalizedText {
    pub tr: String,
    pub en: String,
}

impl LocalizedText {
    pub fn get(&self, language: &str) -> &str {
        match language {
            "en" if !self.en.is_empty() => &self.en,
            _ if !self.tr.is_empty() => &self.tr,
            _ => &self.en,
        }
    }
}

/// Hash imza kaydı.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInfo {
    pub name: String,
    pub severity: Severity,
    #[serde(default)]
    pub description: LocalizedText,
}

#[derive(Debug, Deserialize)]
struct SignatureFile {
    #[allow(dead_code)]
    version: u32,
    #[allow(dead_code)]
    updated: String,
    hashes: HashMap<String, SignatureInfo>,
}

/// Hash anahtarlarını arama sırasında büyük/küçük harf farkı yaşanmaması için normalize eder.
fn normalize_hashes(entries: HashMap<String, SignatureInfo>) -> HashMap<String, SignatureInfo> {
    entries
        .into_iter()
        .map(|(hash, info)| (hash.trim().to_ascii_lowercase(), info))
        .collect()
}

/// SHA-256 tabanlı bilinen zararlı imzaları.
#[derive(Debug, Clone)]
pub struct HashSignatures {
    entries: HashMap<String, SignatureInfo>,
}

impl HashSignatures {
    pub fn bundled() -> Result<Self> {
        let parsed: SignatureFile = serde_json::from_str(SIGNATURES_JSON)
            .map_err(|e| Error::Yara(format!("imza dosyası: {e}")))?;
        Ok(Self {
            entries: normalize_hashes(parsed.hashes),
        })
    }

    /// Gömülü imzaları ve varsa veri dizinindeki harici imzaları yükler.
    /// Bozuk harici dosya uygulamayı durdurmaz; yalnızca uyarı bırakır.
    pub fn load_with_external(data_dir: &std::path::Path) -> Result<Self> {
        let mut hashes = Self::bundled()?;
        let path = data_dir.join(EXTERNAL_SIGNATURES_FILE);
        if path.exists() {
            match Self::from_file(&path) {
                Ok(extra) => {
                    tracing::info!(
                        path = %path.display(),
                        count = extra.len(),
                        "harici imzalar yüklendi"
                    );
                    hashes.merge(extra);
                }
                Err(err) => tracing::warn!(
                    path = %path.display(),
                    error = %err,
                    "harici imza dosyası okunamadı"
                ),
            }
        }
        Ok(hashes)
    }

    pub fn from_json(json: &str) -> Result<Self> {
        let parsed: SignatureFile =
            serde_json::from_str(json).map_err(|e| Error::Yara(format!("imza dosyası: {e}")))?;
        Ok(Self {
            entries: normalize_hashes(parsed.hashes),
        })
    }

    /// Kullanıcı/veri dizinindeki harici imza dosyasını okur.
    pub fn from_file(path: &std::path::Path) -> Result<Self> {
        let json = std::fs::read_to_string(path)?;
        Self::from_json(&json)
    }

    /// Harici imzaları gömülü imzalarla birleştirir; aynı hash varsa harici kayıt kazanır.
    pub fn merge(&mut self, extra: Self) {
        self.entries.extend(extra.entries);
    }

    pub fn lookup(&self, sha256_hex: &str) -> Option<&SignatureInfo> {
        self.entries.get(&sha256_hex.to_ascii_lowercase())
    }

    pub fn add(&mut self, sha256_hex: &str, info: SignatureInfo) {
        self.entries.insert(sha256_hex.to_ascii_lowercase(), info);
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// Bir YARA kuralı eşleşmesi.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YaraMatch {
    pub rule: String,
    pub tags: Vec<String>,
    pub severity: Severity,
    pub title: String,
}

/// YARA-X motorunun ince adaptörü. Gerekirse motor değişimi tek bu dosyada kalır.
pub struct YaraRules {
    rules: yara_x::Rules,
    count: usize,
}

impl YaraRules {
    /// Gömülü kuralları derler.
    pub fn bundled() -> Result<Self> {
        Self::compile(&[])
    }

    /// Gömülü kurallar + test/özel kurallar.
    pub fn compile(extra_sources: &[&str]) -> Result<Self> {
        let mut compiler = yara_x::Compiler::new();
        for (name, source) in BUNDLED_YARA {
            compiler
                .add_source(*source)
                .map_err(|e| Error::Yara(format!("{name}: {e}")))?;
        }
        for (index, source) in extra_sources.iter().enumerate() {
            compiler
                .add_source(*source)
                .map_err(|e| Error::Yara(format!("ek kural #{index}: {e}")))?;
        }
        let rules = compiler.build();
        let count = rules.iter().count();
        Ok(Self { rules, count })
    }

    pub fn count(&self) -> usize {
        self.count
    }

    /// Tek bir kural kaynağını doğrular.
    pub fn validate(source: &str) -> Result<()> {
        let mut compiler = yara_x::Compiler::new();
        compiler
            .add_source(source)
            .map_err(|e| Error::Yara(format!("{e}")))?;
        compiler.build();
        Ok(())
    }

    /// Bellekteki baytları tarar. Her çağrı kendi Scanner'ını oluşturur (thread-safe).
    pub fn scan(&self, data: &[u8]) -> Result<Vec<YaraMatch>> {
        let mut scanner = yara_x::Scanner::new(&self.rules);
        scanner.fast_scan(true);
        scanner.set_timeout(Duration::from_secs(5));
        let results = scanner.scan(data).map_err(|e| Error::Yara(e.to_string()))?;
        let mut matches = Vec::new();
        for rule in results.matching_rules() {
            let identifier = rule.identifier().to_string();
            let tags: Vec<String> = rule
                .tags()
                .map(|tag| tag.identifier().to_string())
                .collect();
            let severity = match severity_from(&identifier, &tags) {
                Some(severity) => severity,
                None => continue,
            };
            matches.push(YaraMatch {
                title: title_for(&identifier),
                rule: identifier,
                tags,
                severity,
            });
        }
        Ok(matches)
    }
}

impl std::fmt::Debug for YaraRules {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("YaraRules")
            .field("count", &self.count)
            .finish()
    }
}

fn severity_from(identifier: &str, tags: &[String]) -> Option<Severity> {
    if tags.iter().any(|tag| tag == "malicious") || identifier.starts_with("malware_") {
        Some(Severity::Malicious)
    } else if tags.iter().any(|tag| tag == "suspicious") || identifier.starts_with("suspicious_") {
        Some(Severity::Suspicious)
    } else {
        // Bilinmeyen/özel kurallar temkinli davranır: yalnızca uyarı.
        Some(Severity::Suspicious)
    }
}

fn title_for(rule: &str) -> String {
    match rule {
        "malware_eicar_test" => "EICAR test file".to_string(),
        "suspicious_powershell_encoded" => "Encoded or hidden PowerShell command".to_string(),
        "suspicious_office_vba_autoexec" => "Auto-executing Office macro".to_string(),
        "suspicious_ransomware_note" => "Ransomware note pattern".to_string(),
        "suspicious_registry_persistence" => "Hidden PowerShell persistence".to_string(),
        "suspicious_credential_theft" => "Browser credential theft pattern".to_string(),
        other => other.replace('_', " "),
    }
}

/// Hash imzası eşleşmesini ortak `Finding` yapısına çevirir.
pub fn signature_finding(info: &SignatureInfo, sha256_hex: &str) -> Finding {
    Finding::new(
        FindingKind::HashSignature,
        info.severity,
        format!("Known malware: {}", info.name),
        format!("SHA-256 {sha256_hex}"),
        Some(info.name.clone()),
    )
}

/// YARA eşleşmesini ortak `Finding` yapısına çevirir.
pub fn yara_finding(matched: &YaraMatch) -> Finding {
    Finding::new(
        FindingKind::YaraRule,
        matched.severity,
        matched.title.clone(),
        format!("YARA rule '{}' matched", matched.rule),
        Some(matched.rule.clone()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_signatures_load() {
        let signatures = HashSignatures::bundled().unwrap();
        assert!(!signatures.is_empty());
        assert!(
            signatures
                .lookup("275A021BBFB6489E54D471899F7DB9D1663FC695EC2FE2A2C4538AABF651FD0F")
                .is_some()
        );
    }

    #[test]
    fn bundled_rules_compile() {
        let rules = YaraRules::bundled().unwrap();
        assert!(rules.count() >= 5);
    }

    #[test]
    fn eicar_rule_matches() {
        let rules = YaraRules::bundled().unwrap();
        // Test örneği parçalardan üretilir; kaynak dosyası AV tarafından kendi kendine tespit edilmez.
        let eicar = [
            b"X5O!P%@AP[".as_slice(),
            b"4\\PZX54(P^)7",
            b"CC)7}$EICAR-STANDARD-",
            b"ANTIVIRUS-TEST-FILE!$H+H*",
        ]
        .concat();
        let matches = rules.scan(&eicar).unwrap();
        assert!(matches.iter().any(|m| m.rule == "malware_eicar_test"));
        assert!(matches.iter().any(|m| m.severity == Severity::Malicious));
    }

    #[test]
    fn external_signatures_can_be_merged() {
        let mut bundled = HashSignatures::bundled().unwrap();
        let extra = HashSignatures::from_json(
            r#"{"version":1,"updated":"test","hashes":{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"name":"Test","severity":"malicious","description":{"tr":"Test","en":"Test"}}}}"#,
        )
        .unwrap();
        assert!(
            bundled
                .lookup("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .is_none()
        );
        bundled.merge(extra);
        assert!(
            bundled
                .lookup("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .is_some()
        );
    }

    #[test]
    fn external_file_is_loaded_from_data_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(EXTERNAL_SIGNATURES_FILE),
            r#"{"version":1,"updated":"test","hashes":{"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB":{"name":"Test","severity":"malicious","description":{"tr":"Test","en":"Test"}}}}"#,
        )
        .unwrap();
        let hashes = HashSignatures::load_with_external(dir.path()).unwrap();
        assert!(
            hashes
                .lookup("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
                .is_some()
        );
        // Bozuk harici dosya gömülü imzaları devre dışı bırakmamalı.
        std::fs::write(dir.path().join(EXTERNAL_SIGNATURES_FILE), "{bozuk").unwrap();
        let hashes = HashSignatures::load_with_external(dir.path()).unwrap();
        assert!(!hashes.is_empty());
    }

    #[test]
    fn eicar_rule_does_not_match_its_own_source() {
        let rules = YaraRules::bundled().unwrap();
        let matches = rules
            .scan(include_bytes!("../../../rules/yara/eicar.yar"))
            .unwrap();
        assert!(!matches.iter().any(|m| m.rule == "malware_eicar_test"));
    }

    #[test]
    fn custom_suspicious_rule_works() {
        let rules = YaraRules::compile(&[r#"rule suspicious_marker_test {
                strings:
                    $marker = "FSOD_TEST_MARKER"
                condition:
                    $marker
            }"#])
        .unwrap();
        let matches = rules.scan(b"prefix FSOD_TEST_MARKER suffix").unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].severity, Severity::Suspicious);
    }

    #[test]
    fn invalid_rule_is_rejected() {
        assert!(YaraRules::validate("rule broken { condition: }").is_err());
    }
}
