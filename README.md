# Sohbet — iki kişilik, Telegram tarzı, uçtan uca şifreli iOS uygulaması

App Store gerekmez; .ipa dosyası olarak telefona yüklenir.

## Özellikler

**Mesajlaşma**
- Yazışma, yanıtlama (alıntılı), düzenleme, kopyalama
- Fotoğraf ve video gönderme (galeriden), tam ekran görüntüleme, paylaşma/kaydetme
- Gönderildi (✓) ve okundu (✓✓) işaretleri
- Çevrimiçi, son görülme ve "yazıyor…" bilgisi
- Sesli ve görüntülü arama (sessiz, hoparlör, kamera aç/kapat, kamera çevir), arama kayıtları

**Silme**
- Mesajı benden sil / herkesten sil
- Sohbeti yalnızca benden ya da iki taraftan da temizle
- Otomatik silme: 30 sn, 5 dk, 1 saat, 1 gün, 1 hafta (iki cihazda birden geçerli)

**Güvenlik**
- Uçtan uca şifreleme: AES-256-GCM; anahtar eşleşme kodundan PBKDF2 (300.000 tur) + HKDF ile türetilir
- Sunucu yalnızca şifreli veri görür; fotoğraf/videolar da şifrelenerek yüklenir
- Kod ve anahtar iPhone Keychain'de, yalnızca bu cihazda tutulur
- Sohbet geçmişi telefonda ayrıca şifreli saklanır, iCloud yedeğine girmez
- Face ID / cihaz şifresi ile uygulama kilidi
- Uygulama değiştiricide içerik gizlenir
- Ekran görüntüsü alındığında karşı tarafa bildirilir
- Kopyalanan kod 2 dakika sonra panodan silinir

**Görünüm**
- Sistem / açık / koyu tema
- Vurgu rengi, 5 arka plan
- Kendi ve karşı tarafın balon rengi ve yazı rengi (renk seçiciyle)
- Yazı boyutu

## 1) IPA dosyasını üret (Mac gerekmez)
1. GitHub'da yeni bir repo aç (public olabilir; kodda gizli bilgi yok).
2. Bu klasörün tüm içeriğini (gizli `.github` klasörü dahil) repoya yükle.
3. **Actions** sekmesi → "iOS IPA" iş akışı çalışır (çalışmazsa "Run workflow").
4. Bitince sayfanın altındaki **Sohbet-ipa** dosyasını indir, zip'i aç → `Sohbet.ipa`.

Mac'in varsa: `brew install xcodegen && xcodegen generate` → `Sohbet.xcodeproj`'yi Xcode'da aç → Signing'de Apple ID'ni seç → Run.

## 2) iPhone'a yükle (Sideloadly ile, Windows veya Mac)
1. https://sideloadly.io adresinden Sideloadly'yi kur.
2. iPhone'u bağla, `Sohbet.ipa`'yı sürükle, Apple ID'ni yaz, **Start**.
3. iPhone: Ayarlar → Gizlilik ve Güvenlik → **Geliştirici Modu**'nu aç.
4. Ayarlar → Genel → **VPN ve Cihaz Yönetimi** → Apple ID'ne **Güven**.
5. Karşı tarafın iPhone'una da aynı IPA'yı yükle.

Ücretsiz Apple ID ile imza **7 günde bir** yenilenmeli (Sideloadly "auto-refresh"). Ücretli geliştirici hesabında 1 yıl.

## 3) Kullanım
1. Biriniz "Yeni kod üret" ile kod oluşturup diğerine güvenli bir yoldan (tercihen yüz yüze) iletsin.
2. İkiniz de adınızı ve aynı kodu girip "Başla"ya basın.
3. Ataç simgesiyle fotoğraf/video, sağ üstten arama; mesaja basılı tutunca yanıtla/düzenle/sil menüsü açılır.

## Bilmen gereken sınırlar
- **Bildirim yok:** Uygulama kapalıyken mesaj/arama bildirimi gelmez (Apple'ın ücretli hesabı ve push sunucusu gerekir). Mesajlar sunucuda 12 saat bekler; açınca gelir.
- **Fotoğraf/video sunucuda 3 saat durur.** Karşı taraf 3 saat içinde uygulamayı açmazsa "Süresi doldu" görünür. Video en fazla ~14 MB (yaklaşık 1-2 dakika); uygulama videoyu otomatik küçültür.
- **Son görülme**, iki taraf da uygulamayı açtığında güncellenir; uygulama kapalıyken arka planda bilgi gönderilmez.
- **Mobil veri:** Görüşme bağlanmazsa Ayarlar → Bağlantı bölümüne bir TURN sunucusu gir.
- ntfy.sh ücretsiz, herkese açık bir hizmettir; çok hızlı art arda gönderimde kısa süre sınır koyabilir. Başarısız mesaja dokunarak tekrar gönderebilirsin.
- iOS ekran görüntüsünü engellemeye izin vermez; uygulama yalnızca bunu algılayıp bildirir.
- "Herkesten sil", karşı tarafın uygulamasında mesajı siler; ama karşı taraf mesajı daha önce kopyaladıysa ya da ekran görüntüsü aldıysa bu geri alınamaz.

## Dosyalar
- `project.yml` — Xcode projesi tanımı (XcodeGen)
- `.github/workflows/build.yml` — GitHub'da imzasız IPA üretir
- `Sohbet/` — Swift kaynak kodu (SwiftUI + WebRTC + CryptoKit)
