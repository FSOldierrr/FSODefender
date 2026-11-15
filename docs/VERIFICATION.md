# FSODefender — Doğrulama Kayıtları

Tarih: 15 Kasım 2026 · Ortam: Windows x64, MSVC 2022 Build Tools, Node.js + Vite 8, WebView2.

## Otomatik kontroller

| Kontrol | Sonuç |
|---|---|
| `cargo test --workspace` | **42 test geçti** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **Uyarı yok** |
| `npm --prefix apps/desktop run build` | **Başarılı** (JS ~374 kB, CSS ~45.6 kB) |

Test kapsamı: hash/YARA tespiti, EICAR kuralının kendi kaynağını eşleştirmemesi, harici imza birleştirme ve büyük/küçük harf normalizasyonu, PE heuristikleri, ZIP limitleri/arşiv taraması, DPAPI + XChaCha karantina round-trip, bozuk blob reddi, veri kaybı olmadan geri yükleme, gerçek zamanlı otomatik karantina, ayarlar/olay tarama geçmişi, URL kara listesi.

## Canlı uygulama testleri

| Senaryo | Sonuç |
|---|---|
| İlk açılış onboarding (nick, dil, gerçek zamanlı) | Başarılı |
| Dashboard, tarama, karantina, web, geçmiş, ayarlar sayfaları | Başarılı; TR/EN ve koyu/açık tema |
| Hızlı tarama + canlı ilerleme + rapor | Başarılı |
| Harici sentetik hash imzasıyla hızlı tarama | Zararlı olarak tespit edildi |
| Manuel tarama raporundan onaylı karantina | Başarılı |
| Karantinadan geri yükleme | Dosya orijinal içerikle geri geldi; UI 0 kayıt gösterdi |
| Karantinadan kalıcı silme | Onay sonrası blob ve kayıt silindi |
| Gerçek zamanlı koruma + sentetik zararlı dosya | **3 saniye içinde otomatik karantina**, toast ve olay günlüğü |
| Yerel kara liste URL kontrolü | `malware.test` zararlı olarak işaretlendi |
| Tek örnek (single-instance) | İkinci süreç kapandı; tek uygulama kaldı |
| Üretim CSP'si | Release paketleme sırasında doğrulandı; onboarding ve varlıklar yüklendi |
| CLI `rules check` | 1 hash · 6 YARA kuralı · motor hazır |
| CLI harici imza taraması | Sentetik hash `malicious`; çıkış kodu **2** |
| CLI `rules` klasörü taraması | Yalnızca 3 `suspicious` (kural dosyaları kendi desenlerini içerir); çıkış kodu **3** |
| NSIS kurulum / kaldırma | Kurulum ve kaldırma tamamlandı; kaldırıcı kullanıcı verisini korudu |

Not: Windows Defender, disk üzerindeki EICAR dosyasının okunmasını `os error 225` ile engelledi. Bu nedenle uçtan uca testler, çalışma anında üretilen sentetik içerik + harici SHA-256 imzasıyla yapıldı. Ürünün kendi YARA/hash katmanı EICAR'ı birim testlerinde tespit etmektedir.

## Windows Defender yanlış pozitifi

İmzasız release ikilisi, ilk kurulum testinde veri dosyaları (`fsodefender.db`, `quarantine.key`, karantina) uygulama ikilisiyle aynı klasördeyken Defender tarafından `Trojan:Win32/Bearfoos.A!ml` olarak işaretlendi. Statik `MpCmdRun` taraması aynı ikiliyi temiz buldu. Aynı ikili, veri dizini ayrı bir klasöre taşındığında sorunsuz çalıştı. Kök neden, currentUser kurulum dizininin (`%LOCALAPPDATA%\FSODefender`) veri diziniyle çakışmasıydı.

Düzeltme: veri dizini `%LOCALAPPDATA%\FSODefenderData` olarak ayrıldı; SPEC ve README güncellendi. Bu, aynı zamanda kasa anahtarının uygulama ikilisiyle aynı klasörde bulunmasını önler. Yeni installer bu düzeltmeyle yeniden üretildi. İmzasız build'lerde Defender ML yanlış pozitifleri yine de mümkündür; kullanıcı korumayı kapatmamalı, dosya hash'ini doğrulayıp Microsoft'a false-positive bildirmelidir.

## Paketleme

| Kontrol | Sonuç |
|---|---|
| Marka ikonları (`tauri icon`) | Oluşturuldu |
| NSIS installer (`FSODefender_0.1.0_x64-setup.exe`) | **Başarılı** — x64, 7.55 MiB; `npm --prefix apps/desktop run tauri build` |
| Kurulum / kaldırma smoke testi | **Başarılı** — kurulum ve kaldırma tamamlandı; kaldırıcı kullanıcı verisini korudu. Kurulu kopyadan açılış ayrıca doğrulanmadı. |

## Bilinen kabul edilebilir sınırlar

- İmzasız MVP; SmartScreen uyarısı beklenir.
- Koruma yalnızca uygulama açıkken çalışır; servis/kernel sürücüsü yoktur.
- DPAPI CurrentUser, aynı kullanıcı hesabıyla çalışan zararlı yazılıma karşı kasa anahtarını korumaz.
- Varsayılan olarak ağ erişimi yoktur; VirusTotal yalnızca kullanıcı anahtarı ve açık URL kontrolüyle devreye girer.
