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
│       ├── index         — ürün ne yapar, admission nasıl karar verir, ücretsiz araçlara karşı konum, nereden başlanır
│       ├── install       — Helm ile kurulum, test edilen K8s tabanı (1.27/1.35), ilk değer
│       ├── what-runs     — cluster envanteri: workload'lar, RBAC gerekçeleriyle, tüm egress tablosu, lisans sunucusu ele geçirilirse ne olur
│       ├── scope         — kapsam dışı beş iş (runtime davranış tespiti, IaC/CIS taraması, CSPM, reachability analizi, repo bağımlılık taraması) ve her biri için yanına ne konulacağı
│       ├── licensing     — planlar, aktivasyon, küme slotları, günlük kontrol (Usage/Licence ekranı + sertifika runway görseli)
│       ├── using-the-console — konsol ekran ekran: güvenlik özeti, politikalar, açıklar, triyaj, kanıt paketi, break-glass, ledger (görselli kılavuz)
│       ├── configuration — Helm değerleri; konsolda kalanların ayrımı (SSO ekranı görseli)
│       ├── policies       — ImageSecurityPolicy: alan referansı, hazır politika
│       │                   örnekleri, endOfLifeOS/knownExploited/provenance kapıları
│       ├── policies-vex   — imzalı OpenVEX bildirimi bir bulguyu sayımdan nasıl çıkarır
│       ├── policies-context — deploymentContext: altı sinyal, escalate kuralları,
│       │                   ClusterRole'ün Services/Ingresses okuması
│       ├── policies-whatif — taslak politikayı ledger üzerinde tekrar oynatma
│       ├── admission     — karar akışı, failurePolicy ve coldImagePolicy duruşu
│       ├── verify-enforcement — 5 dakikalık runbook: kötü pod at, reddi gör, kaydı doğrula
│       ├── operations    — probe'lar, DB kesintisi davranışı, HA, hangi metrik uyandırır, GitOps/ArgoCD
│       ├── air-gapped    — veritabanı aynalama, transparency log'suz imza doğrulama
│       ├── upgrade       — yükseltme, şema (1.0.2→1.1.0: 0013–0020, ileri yönlü),
│       │                   geri alma, imza doğrulama
│       ├── backup        — neyi yedekle (evidence-key ve data-key dahil), config export/import, restore'un kanıta etkisi
│       ├── runtime-events — Falco/Falcosidekick webhook uçnoktası; admission kararını
│       │                   değiştirmez, runtime tespiti kapsam dışı kalır
│       ├── issue-trackers — GitHub/GitLab/Jira kanalları: dedup, dailyCap, kapatma
│       │                   nedenleri, data-key ile şifreli kimlik bilgisi
│       ├── evidence-trust — ledger mühürleme modeli, tek erişimin yapamadığı, garantilerin bittiği yer
│       ├── compliance    — eşlenen 13 çerçeve (293 madde), kanıt paketi içeriği,
│       │                   iddia edilmeyenler ve çeviri şerhleri
│       ├── verifying-reports — indirilen kanıt paketini bağımsız doğrulama
│       ├── releases      — sürüm geçmişi, imza doğrulama komutları
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
│   └── img/              — mark-white.svg, favicon.svg + manual/ (kullanım kılavuzu ekran görüntüleri)
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
