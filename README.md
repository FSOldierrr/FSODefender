# FSODefender

Windows için yerel çalışan, gizlilik odaklı bir antivirüs MVP'si. Rust tabanlı tarama çekirdeği, Tauri 2 masaüstü arayüzü ve Türkçe/İngilizce kullanıcı deneyimi içerir.

> Durum: **MVP / imzasız geliştirme sürümü**. Ürün kararları ve kapsam için `SPEC.md`, uygulama planı için `tasks/plan.md`.

## Özellikler

- SHA-256 hash imzaları ve YARA-X kuralları ile dosya taraması
- PE heuristik analizi (entropi, RWX section, şüpheli import/packer kalıpları)
- Zip bomb korumalı arşiv içi tarama
- Hızlı, tam ve özel dosya/klasör taraması; zamanlanmış tarama
- Gerçek zamanlı dosya koruması ve yalnızca `Malicious` sonuçlarda otomatik karantina
- XChaCha20-Poly1305 + Windows DPAPI ile şifrelenmiş karantina; geri yükleme ve kalıcı silme
- Yerel URL kara listesi; isteğe bağlı, pasif VirusTotal istemcisi
- Sistem tepsisi, bildirimler, tarama geçmişi ve etkinlik günlüğü
- Türkçe/İngilizce arayüz, koyu/açık tema
- Headless CLI

## Mimari

```text
crates/fsod-core     Tarama motoru, imzalar, heuristikler, karantina,
                     gerçek zamanlı koruma, URL itibarı, SQLite depolama
crates/fsod-cli      Headless tarama ve karantina yönetimi
apps/desktop         Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4
rules/               YARA kuralları, hash imzaları, URL kara listesi
```

Tauri uygulaması kendi Cargo workspace'ine sahiptir; kök workspace yalnızca `fsod-core` ve `fsod-cli` crate'lerini kapsar.

## Gereksinimler

- Windows 10 21H2+ veya Windows 11, x64
- Rust stable (edition 2024; `rust-toolchain.toml` kullanılır)
- Node.js 20+ ve npm
- Visual Studio 2022 Build Tools — **Desktop development with C++** iş yükü
- WebView2 Runtime (Windows 10/11'de genellikle kurulu gelir)
- İnternet yalnızca bağımlılıklar ve NSIS paketleyicisi indirilirken gerekir

## Geliştirme

```powershell
# Bağımlılıklar
npm --prefix apps/desktop install

# Masaüstü uygulaması (Vite + Tauri)
npm --prefix apps/desktop run tauri dev

# Frontend üretim derlemesi
npm --prefix apps/desktop run build
```

MSVC ortamı yüklenmemişse bir Developer PowerShell veya `vcvars64.bat` ile açılmış terminal kullanın.

## Test ve kalite kontrolleri

```powershell
cargo fmt --all
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
npm --prefix apps/desktop run build
```

Testler EICAR ve sentetik örnekleri **çalışma anında** üretir; repoda gerçek zararlı yazılım veya çalıştırılabilir örnek bulunmaz. Yerleşik EICAR YARA kuralı hex imzasıyla yazılmıştır; böylece kural dosyası kendi kendini eşleştirmez.

## CLI

`fsod` ikilisi varsayılan olarak `%LOCALAPPDATA%\FSODefenderData` veri dizinini kullanır. `--data-dir` veya `FSOD_DATA_DIR` ile değiştirilebilir. Tüm alt komutlar veritabanını ve harici imza dosyasını aynı şekilde kullanır.

```powershell
# Hızlı tarama
cargo run -p fsod-cli -- scan --quick

# Belirli bir dosya/klasör, JSON çıktısı
cargo run -p fsod-cli -- scan "C:\Users\me\Downloads" --json

# Tam tarama (yavaş)
cargo run -p fsod-cli -- scan --full

# Karantina
cargo run -p fsod-cli -- quarantine list --json
cargo run -p fsod-cli -- quarantine restore <id> --to "C:\GeriYukle"
cargo run -p fsod-cli -- quarantine delete <id> --yes

# Kural doğrulama ve istatistikler
cargo run -p fsod-cli -- rules check
cargo run -p fsod-cli -- stats --json
```

Çıkış kodları:

| Kod | Anlam |
|---|---|
| `0` | Temiz |
| `2` | En az bir zararlı dosya |
| `3` | Yalnızca şüpheli dosya(lar) |
| `1` | Hata |

`quarantine delete` yalnızca `--yes` verildiğinde çalışır.

## Harici hash imzaları

Kurumsal/test imzaları, uygulama kapalıyken şu dosyaya eklenebilir:

```text
%LOCALAPPDATA%\FSODefenderData\signatures.local.json
```

```json
{
  "version": 1,
  "updated": "2026-11-15",
  "hashes": {
    "50444cce79b95b3e14181a2f0c124f0a13d1c04f87394039b2e4c36140e472c0": {
      "name": "Sentetik test imzası",
      "severity": "malicious",
      "description": {
        "tr": "Yerel test imzası",
        "en": "Local test signature"
      }
    }
  }
}
```

- Anahtarlar SHA-256 hex değeridir; büyük/küçük harf farkı normalize edilir.
- `severity`: `malicious`, `suspicious` veya `info`.
- `name` zorunludur; `description` isteğe bağlıdır.
- Dosya yalnızca uygulama/CLI başlangıcında okunur; bozuk dosya gömülü imzaları devre dışı bırakmaz.
- Harici imzalar otomatik güncellenmez ve hiçbir sunucuya gönderilmez.

## Veri ve güvenlik modeli

- Kurulum dizini (currentUser NSIS): `%LOCALAPPDATA%\FSODefender`
- Veri dizini: `%LOCALAPPDATA%\FSODefenderData` — program ikilisinden ayrı tutulur
  - `fsodefender.db`: ayarlar, profil, tarama geçmişi, etkinlikler, karantina meta verisi
  - `quarantine\<uuid>.bin`: şifrelenmiş dosya içeriği
  - `quarantine.key`: DPAPI (CurrentUser) ile korunmuş kasa anahtarı
- Karantina dosyaları XChaCha20-Poly1305 ile şifrelenir. Dosya adları ve orijinal yollar yalnızca yerel SQLite veritabanındadır.
- Geri yükleme çakışma durumunda mevcut dosyanın üzerine yazmaz; `dosya (1).ext` biçiminde yeni ad üretir.
- Telemetri yoktur. Varsayılan olarak hiçbir dosya, URL veya kullanım verisi dışarı gönderilmez.
- VirusTotal anahtarı yalnızca kullanıcı girerse DPAPI ile şifrelenerek saklanır; URL kontrolü kullanıcı tarafından başlatılır.
- Dosyalar asla çalıştırılmaz; yalnızca bayt olarak incelenir.
- Yalnızca `Malicious` verdict otomatik karantinaya alınır. PE heuristiği tek başına en fazla `Suspicious` üretir.
- Geri yükleme, kalıcı silme, korumayı kapatma ve hariç tutma ekleme kullanıcı onayı gerektirir.

## Bilinen sınırlar (MVP)

- İmzasız çalıştırılabilir; Windows SmartScreen uyarısı beklenir. Microsoft Defender, imzasız ve yeni derlenmiş antivirüs ikililerini zaman zaman yanlış pozitif (ör. `Trojan:Win32/Bearfoos.*!ml`) olarak işaretleyebilir. Bu durumda dosya hash'ini doğrulayın ve Microsoft'a false-positive bildirimi yapın; güvenlik korumasını kapatmayın. Kurulum ve veri dizinlerinin ayrılması, kasa anahtarının uygulama ikilisiyle aynı klasörde görünmesini önler.
- Kernel minifilter sürücüsü, Windows servisi, önyükleme koruması ve bulut ML yoktur.
- Gerçek zamanlı koruma yalnızca uygulama açıkken çalışır.
- Varsayılan izleme: Masaüstü, İndirilenler, Belgeler. Kullanıcı ek klasör tanımlayabilir.
- Yara motoru gömülü kural setiyle çalışır; kural güncelleme altyapısı yoktur.
- Ağ tabanlı itibar sorgusu yalnızca kullanıcı VirusTotal anahtarı girerse ve URL kontrolünü başlatırsa yapılır.
- MVP kapsamı dışında: firewall, lisanslama, davranış analizi, gerçek zamanlı bulut sorgusu.

## Paketleme

```powershell
npm --prefix apps/desktop run tauri build
```

NSIS çıktısı:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

Kurulum `currentUser` modundadır ve yönetici yetkisi gerektirmez. Uygulamayı kaldırmak, kullanıcı verilerini (`%LOCALAPPDATA%\FSODefenderData`) otomatik silmez. Kurulum ve veri dizinleri ayrıdır; böylece ikili dosya ile şifreli kasa anahtarı aynı klasörde tutulmaz.

## Proje belgeleri

- `SPEC.md` — ürün spesifikasyonu, kapsam, başarı kriterleri
- `tasks/plan.md` — milestone planı
- `docs/VERIFICATION.md` — otomatik ve canlı test kayıtları
- `README.md` — kurulum, mimari, güvenlik modeli ve CLI kullanımı

## English summary

FSODefender is a local-first Windows antivirus MVP built with Rust, Tauri 2 and React. It provides hash/YARA/PE/archive scanning, real-time protection with automatic quarantine for malicious verdicts, an encrypted quarantine vault, local URL blocklists, a Turkish/English UI and a headless CLI. It ships with no telemetry and no cloud dependency. The MVP is unsigned; a kernel driver, Windows service and cloud/ML features are explicitly out of scope for v1.
