# FSODefender — Uygulama Planı

Spec: `SPEC.md` · Hedef: çalışan, test edilmiş MVP + NSIS installer

## İlkeler

- Dikey dilim: her milestone sonunda uçtan uca çalışan bir şey (CLI → UI).
- Çekirdek (`fsod-core`) platformdan bağımsız API sunar; Windows'a özgü DPAPI sınırlı bir modülde.
- Zararlı örnek asla çalıştırılmaz; testler EICAR'ı çalışma anında üretir.
- Her milestone: `cargo test` + `cargo clippy -D warnings` + commit.

## Milestone'lar

### M0 — Temel (workspace + storage)
- Cargo workspace, fsod-core iskeleti, hata modeli, veri dizinleri.
- SQLite şeması: settings, profile, scans, findings, quarantine, events.
- Ayarlar + nick + dil kalıcılığı.
- **Doğrulama:** storage birim testleri geçer.

### M1 — Tespit motoru
- SHA-256 imza DB'si (`rules/signatures.json` gömülü + harici yükleme).
- YARA-X adaptörü, gömülü kurallar, kural doğrulama.
- PE heuristikleri (entropi, RWX, import, packer).
- ZIP içi tarama (bomb limitleri).
- `Scanner`: ilerleme callback'i, iptal, limitler, verdict birleştirme.
- **Doğrulama:** EICAR + sentetik örnekler entegrasyon testi; yanlış pozitif testi (temiz PE).

### M2 — Karantina
- DPAPI anahtarı, XChaCha20-Poly1305 kasa, metadata.
- Karantinaya al / geri yükle / kalıcı sil.
- **Doğrulama:** round-trip hash eşitliği; yanlış anahtar reddi.

### M3 — CLI
- `scan`, `quarantine list|restore|delete`, `rules check`, `stats`.
- JSON çıktı + exit code sözleşmesi (0 temiz, 2 tehdit, 1 hata).
- **Doğrulama:** uçtan uca CLI testi.

### M4 — Gerçek zamanlı koruma
- `notify` izleyici, debounce, kuyruk, otomatik karantina.
- Olay yayını (threat/scan/status).
- **Doğrulama:** geçici klasöre EICAR bırak → <3 sn karantina (otomatik test).

### M5 — İtibar (URL)
- Yerel kara liste eşleştirici (host + path prefiksleri).
- Pasif VT istemcisi (anahtar yoksa `Disabled` döner).
- **Doğrulama:** kara liste isabet/ıska testleri.

### M6 — Masaüstü arayüzü
- Tauri 2 komutları + olay köprüsü, state yönetimi.
- React: onboarding (nick/dil), dashboard, tarama, karantina, web koruması, geçmiş, ayarlar.
- TR/EN i18n, koyu/açık tema, tray, bildirimler, zamanlanmış tarama.
- **Doğrulama:** manuel smoke + `tauri dev`.

### M7 — Paketleme
- İkonlar, NSIS installer, sürüm bilgisi, README.
- **Doğrulama:** `tauri build` → kur → aç → EICAR senaryosu.

## Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| YARA-X API değişimi | Yüksek | İnce adaptör; derleme anında doğrula |
| VS Build Tools kurulumu | Orta | Arka planda kurulum; başarısızsa WebView2/MSVC kontrolü |
| Gerçek zamanlı testlerde kendi AV'mizin müdahalesi | Düşük | Geçici dizin + EICAR üretimi |
| False positive ile dosya kaybı | Yüksek | Heuristik asla otomatik karantina etmez; geri yükleme her zaman var |
| Tauri derleme süresi | Düşük | Sadece M6'da tam build |
