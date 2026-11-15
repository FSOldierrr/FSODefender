//! PE dosyaları için hafif heuristik analiz.
//!
//! v1 ilkesi: heuristikler **asla** tek başına `Malicious` sonucu üretmez; yüksek skorlu
//! durumlar `Suspicious` olarak raporlanır ve otomatik karantina uygulanmaz. Böylece yanlış
//! pozitifte kullanıcı dosyası riske atılmaz.

use std::collections::BTreeSet;

use crate::models::{Finding, FindingKind, Severity};

const IMAGE_SCN_MEM_EXECUTE: u32 = 0x2000_0000;
const IMAGE_SCN_MEM_WRITE: u32 = 0x8000_0000;
const ENTROPY_THRESHOLD: f64 = 7.2;
const SUSPICIOUS_SCORE_THRESHOLD: u32 = 40;
const MIN_SECTION_SIZE: usize = 4096;

const PACKER_SECTIONS: &[&str] = &[
    "UPX0", "UPX1", "UPX2", "UPX!", ".UPX", "ASPack", ".aspack", ".adata", ".themida", ".vmp0",
    ".vmp1", ".vmp2", "MPRESS1", "MPRESS2", "PEC2", "PEC2MO", ".petite", "NSP0", "NSP1",
];

const SUSPICIOUS_IMPORTS: &[&str] = &[
    "virtualallocex",
    "writeprocessmemory",
    "createremotethread",
    "ntunmapviewofsection",
    "setwindowshookexa",
    "setwindowshookexw",
    "getasynckeystate",
    "urldownloadtofilea",
    "urldownloadtofilew",
    "winexec",
    "shellexecutea",
    "shellexecutew",
    "cryptencrypt",
    "regsetvalueexa",
    "regsetvalueexw",
    "createservicea",
    "createservicew",
];

/// Bir PE dosyasının heuristik analizini yapar. Yalnızca eşiği aşan bulgular döner.
pub fn analyze(bytes: &[u8]) -> Vec<Finding> {
    if !bytes.starts_with(b"MZ") {
        return Vec::new();
    }
    let Ok(pe) = goblin::pe::PE::parse(bytes) else {
        return Vec::new();
    };

    let mut score: u32 = 0;
    let mut findings: Vec<Finding> = Vec::new();

    // 1) Packer bölüm isimleri
    let mut packer_hits = BTreeSet::new();
    for section in &pe.sections {
        let name = section_name(section);
        for packer in PACKER_SECTIONS {
            if name.eq_ignore_ascii_case(packer) {
                packer_hits.insert(name.clone());
            }
        }
    }
    if !packer_hits.is_empty() {
        score += 40;
        let list = packer_hits.into_iter().collect::<Vec<_>>().join(", ");
        findings.push(Finding::new(
            FindingKind::PeHeuristic,
            Severity::Suspicious,
            "Packer sections detected",
            format!("Sections commonly used by packers: {list}"),
            None,
        ));
    }

    // 2) Yazılabilir + çalıştırılabilir bölümler
    let mut rwx_sections = Vec::new();
    let mut highest_entropy = 0.0_f64;
    let mut highest_entropy_section = String::new();
    for section in &pe.sections {
        let name = section_name(section);
        let flags = section.characteristics;
        if flags & IMAGE_SCN_MEM_EXECUTE != 0 && flags & IMAGE_SCN_MEM_WRITE != 0 {
            rwx_sections.push(if name.is_empty() {
                "<unnamed>".to_string()
            } else {
                name.clone()
            });
        }
        match section.data(bytes) {
            Ok(Some(data)) if data.len() >= MIN_SECTION_SIZE => {
                let entropy = shannon_entropy(&data);
                if entropy > highest_entropy {
                    highest_entropy = entropy;
                    highest_entropy_section = name;
                }
            }
            _ => {}
        }
    }
    if !rwx_sections.is_empty() {
        score += 25;
        findings.push(Finding::new(
            FindingKind::PeHeuristic,
            Severity::Suspicious,
            "Writable and executable section",
            format!("Sections marked RWX: {}", rwx_sections.join(", ")),
            None,
        ));
    }
    if highest_entropy > ENTROPY_THRESHOLD {
        score += 30;
        findings.push(Finding::new(
            FindingKind::PeHeuristic,
            Severity::Suspicious,
            "High entropy section",
            format!(
                "Section '{highest_entropy_section}' has {highest_entropy:.2} bits/byte entropy (possibly packed or encrypted)"
            ),
            None,
        ));
    }

    // 3) Şüpheli API import'ları
    let mut import_hits = BTreeSet::new();
    for import in &pe.imports {
        let name = import.name.to_ascii_lowercase();
        if SUSPICIOUS_IMPORTS.contains(&name.as_str()) {
            import_hits.insert(import.name.to_string());
        }
    }
    if !import_hits.is_empty() {
        let capped = import_hits.len().min(3) as u32;
        score += 8 * capped;
        findings.push(Finding::new(
            FindingKind::PeHeuristic,
            Severity::Suspicious,
            "Suspicious API imports",
            format!(
                "Imports associated with injection or persistence: {}",
                import_hits.into_iter().collect::<Vec<_>>().join(", ")
            ),
            None,
        ));
    }

    // 4) İçe aktarma tablosu boş ama büyük dosya
    if pe.imports.is_empty() && bytes.len() > 64 * 1024 {
        score += 10;
        findings.push(Finding::new(
            FindingKind::PeHeuristic,
            Severity::Suspicious,
            "Empty import table",
            "Large PE file without an import table".to_string(),
            None,
        ));
    }

    if score >= SUSPICIOUS_SCORE_THRESHOLD {
        findings
    } else {
        Vec::new()
    }
}

fn section_name(section: &goblin::pe::section_table::SectionTable) -> String {
    section.name().unwrap_or("?").trim_matches('\0').to_string()
}

/// Shannon entropisi (bit/bayt).
pub fn shannon_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mut counts = [0u64; 256];
    for &byte in data {
        counts[byte as usize] += 1;
    }
    let len = data.len() as f64;
    counts
        .iter()
        .filter(|&&count| count > 0)
        .map(|&count| {
            let p = count as f64 / len;
            -p * p.log2()
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entropy_of_constant_data_is_zero() {
        assert_eq!(shannon_entropy(&[7u8; 1024]), 0.0);
    }

    #[test]
    fn entropy_of_uniform_data_is_high() {
        let data: Vec<u8> = (0..=255).collect();
        let entropy = shannon_entropy(&data);
        assert!((entropy - 8.0).abs() < 0.001);
    }

    #[test]
    fn non_pe_data_produces_no_findings() {
        assert!(analyze(b"hello world").is_empty());
    }
}
