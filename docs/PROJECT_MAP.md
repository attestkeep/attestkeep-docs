# attestkeep-docs — proje haritası

`docs.attestkeep.com`. Statik HTML; çalışma zamanında framework, analitik ve
üçüncü taraf isteği yok. Kaynak `src/`, yayınlanan çıktı `public/`.

```
attestkeep-docs/
├── package.json          — npm run build (render + check)
├── src/
│   ├── layout.html       — kabuk: üst bar, kenar çubuğu, içerik, alt bilgi
│   ├── nav.json          — kenar çubuğunun kaynağı; burada olmayan sayfa
│   │                       build'i düşürür (öksüz sayfa yayınlanmaz)
│   └── pages/            — her sayfanın gövdesi + <!--meta {...} --> bloğu
│       ├── index         — ürün ne yapar, admission nasıl karar verir, nereden başlanır
│       ├── install       — Helm ile kurulum, ilk kurulumda ayarlanacak tek değer
│       ├── licensing     — planlar, aktivasyon, küme slotları, günlük kontrol
│       ├── configuration — Helm değerleri; konsolda kalanların ayrımı
│       ├── admission     — karar akışı, failurePolicy ve coldImagePolicy duruşu
│       ├── air-gapped    — veritabanı aynalama, transparency log'suz imza doğrulama
│       ├── upgrade       — yükseltme, şema, geri alma, imza doğrulama
│       ├── compliance    — eşlenen çerçeveler, kanıt paketi içeriği, iddia edilmeyenler
│       ├── troubleshooting — sahada gerçekten karşılaşılan beş şey
│       ├── support       — hata bildirimi, açık bildirimi, plana göre destek
│       └── 404           — gezinilebilir değil, bilerek nav dışında
├── scripts/
│   ├── render.mjs        — sayfaları üretir, sitemap ve robots.txt yazar
│   └── check.mjs         — kapı: metadata, ölü iç link, eski marka kalıntısı
├── public/               — ÜRETİLEN çıktı; elle düzenlenmez
│   ├── assets/tokens.css — attestkeep-ui'daki paletin kopyası; ikisi de
│   │                       brand/README.md'den türer, elle renk uydurulmaz
│   ├── assets/docs.css   — yalnızca doküman kabuğu
│   ├── assets/docs.js    — dar ekranda menüyü açar; sitedeki tek script
│   ├── fonts/            — Archivo + JetBrains Mono, kendi origin'imizden
│   └── img/              — mark-white.svg, favicon.svg
├── deploy/nginx.conf     — uzantısız URL, CSP ve güvenlik başlıkları, cache sınıfları
└── Dockerfile            — node ile render+check, nginx ile servis
```

Notlar:

- Sayfa URL'leri uzantısız: `/install/`, `/install.html` değil.
- `tokens.css` bir **kopya**. Palet değişirse iki repoda da değişmeli;
  `check.mjs` bunu yakalamaz, çünkü kopya olduğu için ikisi de geçerli görünür.
- Kurulum komutları `attestkeep` chart ve `ghcr.io/attestkeep/attestkeep-k8s`
  imaj adlarını kullanır. Bu adlar ürün rename'i ile birlikte gerçek oldu
  (2026-08-27); rename öncesi yazılmış hiçbir komut burada bırakılmadı.
