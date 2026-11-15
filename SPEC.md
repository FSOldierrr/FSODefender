# FSODefender — Ürün Spesifikasyonu (v1.0 — onaylandı)

## Vizyon

Windows için modern, hafif ve şeffaf bir antivirüs. Kaspersky/Bitdefender'ın temel koruma döngüsünü
(**tara → tespit et → karantinaya al → bildir → geri yükle**) ticari kalitede bir mimariyle uygulayan;
ileride kernel sürücüsü, bulut itibar servisi ve lisanslama katmanları eklenebilecek bir çekirdek.

**Hedef kullanıcı (v1):** Teknik bilgi düzeyi orta, Windows 10/11 kullanan son kullanıcı.
**Başarı:** Kullanıcı dosya indirir → otomatik taranır → tehdit sessizce karantinaya alınır → kullanıcı
tek ekranda ne olduğunu anlar.

## Ürün Kararları (onaylandı)

- **İsim:** FSODefender
- **Diller:** Türkçe + İngilizce (arayüzden anında değiştirilebilir)
- **Hedef platform:** Windows 10 21H2+ ve Windows 11, x64
- **İmzalama:** MVP imzasız (SmartScreen uyarısı beklenir; sertifika ticari sürüm işi)
- **Yerel kimlik:** İlk açılışta kullanıcı bir **nick** belirler. Hesap, e-posta, bulut kaydı yoktur;
  profil yalnızca yerel SQLite'ta saklanır.
- **Gizlilik / dış müdahale yok:** Telemetri yok, uzaktan yönetim yok, otomatik bulut sorgusu yok.
  Ağ erişimi yalnızca kullanıcının açıkça tetiklediği URL kontrolünde (ve ileride kendi anahtarını
  girerse VirusTotal'de) olur.
- **İnsan kontrolü:** Uzaktan/otomatik dış müdahale yoktur. Koruma aksiyonları (tespit → karantina)
  yerelde otomatik çalışır; ancak **kalıcı silme, korumayı kapatma, hariç tutma ekleme ve geri yükleme
  yalnızca kullanıcı onayıyla** yapılır. Her aksiyon loglanır.
- **VirusTotal:** MVP'de anahtar yok → özellik pasif. İleride kullanıcı kendi anahtarını girerse aktifleşir.

## Kapsam (MVP v1)

| Özellik | v1 |
|---|---|
| Hash imza taraması (SHA-256) | ✅ |
| YARA-X kural taraması | ✅ |
| PE heuristik analizi (entropi, şüpheli import, packer) | ✅ |
| ZIP arşiv içi tarama (zip bomb korumalı) | ✅ |
| Hızlı / tam / özel klasör tarama + zamanlanmış tarama | ✅ |
| Gerçek zamanlı dosya koruması (otomatik karantina) | ✅ |
| Şifreli karantina + geri yükleme | ✅ |
| URL kara liste kontrolü (yerel, ağsız) | ✅ |
| Modern masaüstü arayüzü (TR + EN, koyu/açık tema) | ✅ |
| Sistem tepsisi + bildirimler | ✅ |
| CLI (headless tarama, geliştirici/test aracı) | ✅ |
| Kernel minifilter sürücüsü | ❌ v2 |
| Bulut ML / davranış analizi / firewall / lisanslama | ❌ v2+ |
| VirusTotal (kullanıcı anahtarıyla) | 🔶 iskelet, pasif |

## Capability Map

| Module id | Sorumluluk | Bağımlılık |
|---|---|---|
| `storage` | SQLite: ayarlar, profil, tarama geçmişi, tehdit kayıtları, karantina meta verisi | — |
| `engine` | Tarama orkestrasyonu, verdict birleştirme, ilerleme/işiptal, hata modelleri | storage |
| `signatures` | SHA-256 imza veritabanı, YARA-X kural yükleme/doğrulama | engine |
| `heuristics` | PE dosya analizi ve risk skoru | engine |
| `quarantine` | DPAPI korumalı anahtar, XChaCha20-Poly1305 şifreli kasa, geri yükleme | engine, storage |
| `realtime` | Klasör izleme (notify), tarama kuyruğu, otomatik aksiyon, olay yayını | engine, quarantine |
| `reputation` | URL kara listesi eşleştirici + pasif VT istemcisi | storage |
| `desktop-ui` | Tauri 2 + React: dashboard, tarama, karantina, ayarlar, i18n | tümü (IPC) |
| `cli` | Headless tarama ve geliştirici araçları | engine, signatures, heuristics |

**Build sırası:** `storage` → `engine` + `signatures` + `heuristics` → `quarantine` → `cli` →
`realtime` → `reputation` → `desktop-ui` → paketleme

## Teknoloji Yığını

- **Dil:** Rust (stable, edition 2024) — workspace
- **Masaüstü:** Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4
- **Tarama:** `yara-x` (VirusTotal'ın Rust YARA motoru), `goblin` (PE ayrıştırma), `zip` (arşiv)
- **Gerçek zamanlı:** `notify` (ReadDirectoryChangesW)
- **Depolama:** `rusqlite` (bundled SQLite)
- **Kripto:** `chacha20poly1305` (XChaCha20-Poly1305) + Windows DPAPI (`windows-sys`)
- **Async/HTTP:** `tokio`, `reqwest` (yalnızca isteğe bağlı VT)
- **Hata/log:** `thiserror`, `tracing`
- **Paketleme:** Tauri NSIS

> Risk: YARA-X API'si sürümler arası değişebilir. `signatures` modülü ince bir adaptör katmanıyla
> izole edilir; gerekirse kendi kural motorumuza geçiş tek modülde kalır.

## Tespit Stratejisi (v1)

1. **Hash imzası:** SHA-256 → yerel imza DB'si (JSON'dan SQLite'a seed). EICAR + test örnekleri.
2. **YARA kuralları:** EICAR, PowerShell dropper, makro şüphesi, fidye yazılımı davranış kalıpları,
   crack/activator kalıpları. Ticari kural **kopyalanmaz**; kendi sade kurallarımız yazılır.
   Kural adı sözleşmesi: `malware_*` → Malicious, `suspicious_*` → Suspicious.
3. **PE heuristik skoru:** yüksek entropili section, RWX section, şüpheli import'lar
   (`VirtualAlloc`, `WriteProcessMemory`, `CreateRemoteThread`), packer isimleri (UPX vb.),
   imzasız + yüksek entropi kombinasyonu. v1'de heuristik tek başına **Suspicious** verir
   (yanlış pozitifte dosya karantinaya alınmaz, yalnızca uyarılır).
4. **Arşiv:** ZIP içindeki dosyalar aynı hattan geçirilir (derinlik 2, toplam açılmış boyut ≤ 512 MB,
   giriş başına ≤ 64 MB, ≤ 10.000 giriş) — zip bomb koruması.
5. **Verdict:** `Clean` / `Suspicious` (uyar) / `Malicious` (karantina). Her tespit gerekçesiyle
   (`reason`) saklanır — şeffaflık ticari fark.

## Karantina

- Dosya `%LOCALAPPDATA%\FSODefenderData\quarantine\<uuid>.bin` olarak şifreli saklanır.
  Veri dizini, currentUser kurulum dizininden (`%LOCALAPPDATA%\FSODefender`) ayrı tutulur.
- Meta veri SQLite'ta: orijinal yol, SHA-256, verdict, tetikleyen kural, boyut, zaman.
- Anahtar DPAPI (CurrentUser) ile korunur; dosya adı ve içeriği şifreli.
- Geri yükleme orijinal yola (çakışmada `dosya (1).ext`) yapılır; yalnızca kullanıcı aksiyonuyla.
- Kalıcı silme ayrı, onaylı aksiyon.

## Gerçek Zamanlı Koruma

- Varsayılan izlenen: Masaüstü, İndirilenler, Belgeler + kullanıcı ekleyebilir.
- `notify` + 500 ms debounce; 2 iş parçacıklı tarama kuyruğu.
- `Malicious` → otomatik karantina + UI bildirimi. `Suspicious` → yalnızca log/uyarı.
- Hariç tutulanlar: karantina dizini, uygulama verisi, >256 MB dosyalar, reparse point'ler (v1).
- Uygulama kapalıyken koruma durur (v1); Windows servisi v2.

## Arayüz (TR + EN)

- **İlk açılış:** nick belirleme + dil seçimi + kısa tanıtım.
- **Dashboard:** koruma durumu, son tarama, tehdit sayacı, hızlı tarama, koruma anahtarı.
- **Tarama:** hızlı/tam/özel, canlı ilerleme, bulunanlar listesi, iptal.
- **Karantina:** liste, ayrıntı, geri yükle, sil (onaylı).
- **Web Koruması:** URL sorgulama, kara liste yönetimi (yerel).
- **Ayarlar:** nick, dil, tema, gerçek zamanlı, zamanlanmış tarama, hariç tutmalar, VT anahtarı (pasif).
- **Geçmiş:** tarama geçmişi + tehdit olayları.
- Sistem tepsisi: göster/gizle, hızlı tarama, çıkış; tehdit bildirimleri.

## Proje Yapısı

```
FSODefend/                  # repo kökü (klasör adı korunuyor)
├─ Cargo.toml               # workspace
├─ crates/
│  ├─ fsod-core/            # storage, engine, signatures, heuristics, quarantine, realtime, reputation
│  └─ fsod-cli/             # headless CLI
├─ apps/desktop/            # Tauri 2 + React arayüz
├─ rules/                   # YARA kuralları + hash imzaları + URL kara liste
├─ docs/                    # ADR'ler, tehdit modeli
├─ samples/                 # yalnızca üretilen EICAR/test dosyaları (gerçek zararlı YOK)
├─ tasks/                   # plan.md, todo.md
└─ SPEC.md
```

## Komutlar

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
cargo run -p fsod-cli -- scan samples --json
npm --prefix apps/desktop run dev          # Vite (UI geliştirme)
npm --prefix apps/desktop run tauri dev    # Tauri geliştirme
npm --prefix apps/desktop run tauri build  # installer
```

## Kod Stili

- Rust: `rustfmt` varsayılanı; kütüphane kodunda `unwrap()` yok; hatalar `thiserror`; loglar `tracing`.
- TypeScript: `strict`, fonksiyonel bileşenler, `any` yok; Tailwind utility + design token seti.

```rust
/// Tarama sonucunu verdict'e çevirir; her karar gerekçesiyle birlikte döner.
pub fn evaluate(findings: &[Finding]) -> Verdict {
    let malicious = findings.iter().any(|f| f.severity == Severity::Malicious);
    let suspicious = findings.iter().any(|f| f.severity == Severity::Suspicious);
    match (malicious, suspicious) {
        (true, _) => Verdict::Malicious,
        (false, true) => Verdict::Suspicious,
        _ => Verdict::Clean,
    }
}
```

## Test Stratejisi

- Birim testleri modüllerin yanında; entegrasyon testleri `crates/fsod-core/tests/` (tempfile ile izole dizin).
- EICAR çalışma anında üretilir (repoda zararlı dosya tutulmaz); gerçek zamanlı testlerde geçici dizin kullanılır.
- Karantina round-trip testi: şifrele → sil → geri yükle → hash eşitliği.
- ZIP bomb limitleri ve büyük dosya atlama testleri.
- Hedef: çekirdek engine satır kapsamı ≥ %80 (`cargo-llvm-cov`).
- UI: v1'de manuel smoke test; kritik akışlar için Playwright (v2).

## Sınırlar

- **Her zaman:** commit öncesi test; girdi doğrulama; dosyaları yalnızca bayt olarak incele; zaman aşımı ve boyut limiti uygula.
- **Önce sor:** yeni dış bağımlılık, veritabanı şeması değişikliği, UI tasarım sistemi değişikliği, admin yetkisi gerektiren her şey.
- **Asla:** gerçek zararlı yazılım commit'leme; API anahtarı commit'leme; Windows Defender'ı devre dışı bırakma; kullanıcı dosyasını karantina yedeği olmadan silme; şüpheli örneği çalıştırma.

## Başarı Kriterleri (MVP)

1. EICAR + en az 3 test örneği hash ve YARA katmanlarıyla tespit edilir.
2. İzlenen klasöre bırakılan EICAR **3 saniye içinde** karantinaya alınır ve UI'da görünür.
3. Karantinadan geri yükleme sonrası dosya hash'i orijinalle birebir aynıdır.
4. URL kontrolü yerel kara liste ile çalışır; sonuçlar TR/EN olarak gösterilir.
5. `cargo test` ve `cargo clippy -D warnings` temiz geçer.
6. `tauri build` ile NSIS installer üretilir ve kurulan uygulama açılır.

## Çözülen Sorular

1. ~~Marka~~ → **FSODefender**
2. ~~Dil~~ → **TR + EN**
3. ~~VirusTotal anahtarı~~ → **Yok; özellik pasif, ileride kullanıcı anahtarıyla açılır**
4. ~~Minimum Windows~~ → **Windows 10 21H2+ / Windows 11 x64**
5. ~~Dijital imza~~ → **MVP imzasız**
