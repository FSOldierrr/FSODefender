//! URL itibar kontrolü.
//!
//! v1: yerel kara liste (ağsız). VirusTotal istemcisi pasiftir; yalnızca kullanıcı
//! kendi API anahtarını girerse ve açıkça sorgularsa kullanılır.

use url::Url;

use crate::error::{Error, Result};
use crate::models::{ReputationResult, Verdict};

const BLACKLIST: &str = include_str!("../../../rules/url_blacklist.txt");

#[derive(Debug, Clone)]
struct Entry {
    host: String,
    path: Option<String>,
    raw: String,
}

/// Yerel URL kara listesi. Alt alan adları da eşleşir.
pub struct UrlBlacklist {
    entries: Vec<Entry>,
}

impl UrlBlacklist {
    pub fn bundled() -> Self {
        Self::parse(BLACKLIST)
    }

    pub fn parse(text: &str) -> Self {
        let mut entries = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let raw = line.to_string();
            let (host, path) = match line.split_once('/') {
                Some((host, path)) => (host, Some(format!("/{}", path.to_ascii_lowercase()))),
                None => (line, None),
            };
            let host = host
                .trim_start_matches("*.")
                .trim_end_matches('.')
                .to_ascii_lowercase();
            if host.is_empty() {
                continue;
            }
            entries.push(Entry { host, path, raw });
        }
        Self { entries }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// URL'yi yerel listeyle kontrol eder.
    pub fn check(&self, raw_url: &str) -> Result<ReputationResult> {
        let candidate = if raw_url.contains("://") {
            raw_url.to_string()
        } else {
            format!("http://{raw_url}")
        };
        let parsed =
            Url::parse(&candidate).map_err(|err| Error::Invalid(format!("Geçersiz URL: {err}")))?;
        let host = parsed
            .host_str()
            .ok_or_else(|| Error::Invalid("URL'de alan adı yok".to_string()))?
            .to_ascii_lowercase();
        let path = parsed.path().to_ascii_lowercase();

        let mut matches = Vec::new();
        for entry in &self.entries {
            let host_matches = host == entry.host || host.ends_with(&format!(".{}", entry.host));
            if !host_matches {
                continue;
            }
            let path_matches = entry
                .path
                .as_ref()
                .map(|prefix| path.starts_with(prefix))
                .unwrap_or(true);
            if path_matches {
                matches.push(entry.raw.clone());
            }
        }

        Ok(ReputationResult {
            url: candidate,
            host,
            verdict: if matches.is_empty() {
                Verdict::Clean
            } else {
                Verdict::Malicious
            },
            matches,
            source: "local".to_string(),
        })
    }
}

/// VirusTotal API v3 istemcisi (pasif; anahtar yoksa hata döner).
pub struct VirusTotalClient {
    api_key: Option<String>,
    http: reqwest::Client,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VtReputation {
    pub status: String,
    pub malicious: u32,
    pub suspicious: u32,
    pub harmless: u32,
    pub undetected: u32,
}

impl VirusTotalClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key: api_key.filter(|key| !key.trim().is_empty()),
            http: reqwest::Client::new(),
        }
    }

    pub fn configured(&self) -> bool {
        self.api_key.is_some()
    }

    /// URL'yi VirusTotal'e gönderir ve analiz istatistiklerini döndürür.
    /// Yalnızca kullanıcı açıkça tetiklediğinde çağrılmalıdır.
    pub async fn check_url(&self, url: &str) -> Result<VtReputation> {
        let key = self.api_key.as_ref().ok_or_else(|| {
            Error::Invalid("VirusTotal API anahtarı yapılandırılmadı".to_string())
        })?;

        let submit = self
            .http
            .post("https://www.virustotal.com/api/v3/urls")
            .header("x-apikey", key)
            .form(&[("url", url)])
            .send()
            .await
            .map_err(|err| Error::Network(err.to_string()))?;
        if !submit.status().is_success() {
            return Err(Error::Network(format!(
                "VirusTotal yanıtı: {}",
                submit.status()
            )));
        }
        let submit_json: serde_json::Value = submit
            .json()
            .await
            .map_err(|err| Error::Network(err.to_string()))?;
        let analysis_id = submit_json["data"]["id"]
            .as_str()
            .ok_or_else(|| Error::Network("VirusTotal analiz kimliği yok".to_string()))?;

        let analysis = self
            .http
            .get(format!(
                "https://www.virustotal.com/api/v3/analyses/{analysis_id}"
            ))
            .header("x-apikey", key)
            .send()
            .await
            .map_err(|err| Error::Network(err.to_string()))?;
        if !analysis.status().is_success() {
            return Err(Error::Network(format!(
                "VirusTotal yanıtı: {}",
                analysis.status()
            )));
        }
        let json: serde_json::Value = analysis
            .json()
            .await
            .map_err(|err| Error::Network(err.to_string()))?;
        let attributes = &json["data"]["attributes"];
        let stats = &attributes["stats"];

        Ok(VtReputation {
            status: attributes["status"]
                .as_str()
                .unwrap_or("unknown")
                .to_string(),
            malicious: as_u32(&stats["malicious"]),
            suspicious: as_u32(&stats["suspicious"]),
            harmless: as_u32(&stats["harmless"]),
            undetected: as_u32(&stats["undetected"]),
        })
    }
}

fn as_u32(value: &serde_json::Value) -> u32 {
    value
        .as_u64()
        .and_then(|number| u32::try_from(number).ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_blacklist_matches_exact_host() {
        let list = UrlBlacklist::bundled();
        let result = list.check("https://malware.test/download.exe").unwrap();
        assert_eq!(result.verdict, Verdict::Malicious);
        assert_eq!(result.host, "malware.test");
    }

    #[test]
    fn subdomains_are_matched() {
        let list = UrlBlacklist::bundled();
        let result = list
            .check("https://login.secure-bank-verify.test/")
            .unwrap();
        assert_eq!(result.verdict, Verdict::Malicious);
    }

    #[test]
    fn path_prefix_is_matched() {
        let list = UrlBlacklist::bundled();
        let hit = list.check("phishing.test/login?user=1").unwrap();
        assert_eq!(hit.verdict, Verdict::Malicious);
        let miss = list.check("phishing.test/haberler").unwrap();
        assert_eq!(miss.verdict, Verdict::Clean);
    }

    #[test]
    fn unknown_host_is_clean() {
        let list = UrlBlacklist::bundled();
        let result = list.check("https://example.com").unwrap();
        assert_eq!(result.verdict, Verdict::Clean);
        assert!(result.matches.is_empty());
    }

    #[test]
    fn invalid_url_is_rejected() {
        let list = UrlBlacklist::bundled();
        assert!(list.check("http://").is_err());
    }

    #[tokio::test]
    async fn vt_without_key_is_disabled() {
        let client = VirusTotalClient::new(None);
        assert!(!client.configured());
        assert!(client.check_url("https://example.com").await.is_err());
    }
}
