# Pikku aktarma sunucusu (Cloudflare)

Pikku'nun mesajlarını iki cihaz arasında taşıyan küçük sunucu. Cloudflare'in ücretsiz planında çalışır
(günde 100.000 istek; iki kişi için fazlasıyla yeter). Mesajlar telefonda şifrelenir, sunucu içeriği göremez,
7 gün sonra siler. Fotoğraf ve videolar da şifreli olarak R2'de (pikku-media) 7 gün tutulur.

Kurulum: Cloudflare panosu › Workers & Pages › Create › Import a repository › bu depo,
Root directory: `relay`. Kurulunca çıkan `https://pikku-relay.<ad>.workers.dev` adresini
Pikku › Ayarlar › Bağlantı › Aktarma sunucusu alanına yaz. Karşı tarafın cihazı yeni adresi kendiliğinden öğrenir.
