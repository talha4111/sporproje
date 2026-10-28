<div align="center">
  <h1>🥗 Makro Takip — AI Vision Sporcu Beslenme, Kalori & Akıllı Koç Platformu</h1>
  <p><strong>React 19, TypeScript, Gemini 2.5 Vision, Open Food Facts ve Capacitor Android Destekli Offline-First Beslenme & Makro Optimizasyon Uygulaması</strong></p>
  
  [![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
  [![Capacitor](https://img.shields.io/badge/Capacitor-Android_APK-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com/)
  [![Gemini Vision](https://img.shields.io/badge/Gemini_2.5_Flash-Food_Vision_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
</div>

<br>

## 📖 Proje Hakkında
**Makro Takip (`sporproje`)**, sporcular ve sağlıklı yaşam odaklı kullanıcılar için geliştirilmiş, **Bilgisayarlı Görü (AI Food Vision)**, **Matematiksel Makro Açığı Çözücü (Deterministic Macro Gap Solver)**, **Barkod/Besin Sağlık Radarı** ve **Yerel Veritabanı (IndexedDB)** mimarilerini birleştiren hibrit bir **Web (PWA) ve Android (Capacitor 8)** uygulamasıdır.

Sunucu bağımlılığı olmadan **Offline-First** prensibiyle çalışır; tüm kullanıcı verilerini tarayıcı ve mobil cihaz üzerinde `Dexie.js` (IndexedDB) ile saklar ve `Zustand` ile reaktif olarak yönetir.

---

## ✨ Öne Çıkan Mühendislik Özellikleri

### 1. 📸 AI Vision Tabak Analizi (`src/services/aiVision.ts`)
- **Google Gemini 2.5 Flash / 2.0 Flash Vision Entegrasyonu:** Çekilen veya galeriden yüklenen yemek fotoğrafını istemci tarafında (`Canvas`) sıkıştırarak analiz eder.
- **Porsiyon & Gramaj Tahmini:** Tabak çapı, çatal/kaşık boyutu ve görsel derinliği referans alarak tabaktaki her bir besin kalemini ayırır, tahmini gramajını (`estimatedGrams`), güven skorunu (`confidence`) ve 100g bazında kalori, protein, karbonhidrat, yağ, lif, şeker ve tuz değerlerini yapılandırılmış JSON şemasıyla döndürür.

### 2. 🧮 Matematiksel Makro Açığı Çözücü & AI Koç (`src/services/aiCoach.ts`)
- **Deterministik Öğün Optimizasyonu (`solveMacroGap`):** Kullanıcının gün içinde kalan protein, karbonhidrat ve yağ açığını kapatmak için 3 farklı sporcu menü şablonunu (*Antrenman Sonrası Klasik*, *Hızlı Kahvaltı / Shake*, *Akşam Dengeli Tabak*) gramaj bazında doğrusal olarak ölçeklendirir.
- **Kişisel AI Sporcu Diyetisyeni:** Günlük makro dağılımını, su tüketimini ve hedef uyumluluğunu analiz ederek Gemini destekli koçluk geri bildirimi üretir.

### 3. 🔍 Barkod Okuyucu, Open Food Facts & Sağlık Radarı (`src/services/foodApi.ts`)
- **Canlı Kamera Barkod Tarayıcı (`html5-qrcode`):** Paketli ürünlerin barkodlarını okur ve **Open Food Facts v2 & Search-a-licious API** üzerinden besin değerlerini çeker.
- **Sağlık Radarı (`computeHealthRadar`):** Ürünleri **NOVA Gıda İşlenme Grubu (1–4)**, **Nutri-Score (A–E)**, **Palm Yağı**, **Katkı Maddesi (E-Kodu) Sayısı** ve şeker/tuz eşiklerine göre otomatik denetler.
- **Yerleşik Türkiye Besin Veritabanı (`src/data/turkishFoods.ts`):** İnternet bağlantısı olmadığında dahi Türk mutfağı ve sporcu besinlerine anında erişim sağlar.

### 4. ⚡ Metabolizma Motoru, Offline-First Mimari & Çoklu Cihaz Senkronizasyonu
- **BMR & TDEE Hesaplayıcı (`src/utils/metabolism.ts`):** Mifflin-St Jeor denklemi, aktivite çarpanları ve hedef profillerine (Definasyon, Koruma, Temiz Bulk) göre günlük kalori ve makro hedeflerini hesaplar (**Vitest** birim testleri ile doğrulanmıştır).
- **IndexedDB (`Dexie.js`) & `Zustand`:** Öğün kayıtları, su takibi, kilo geçmişi, favori/özel besinler ve haftalık analiz grafikleri tamamen yerel veritabanında tutulur.
- **LAN Köprüsü & QR Senkronizasyon (`vite.config.ts`):** Bilgisayar ve mobil cihaz arasında yerel ağ üzerinden tek tıkla yapılandırma ve veri aktarımı sağlar.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknolojiler |
| :--- | :--- |
| **Frontend & UI** | React 19, TypeScript 6, Tailwind CSS 4, Lucide Icons |
| **Durum & Yerel Veritabanı** | Zustand 5, Dexie.js 4 (IndexedDB), LocalStorage Persistence |
| **Yapay Zeka & Harici API** | Google Gemini 2.5/2.0 Flash Vision API, Open Food Facts API |
| **Mobil & Donanım** | Capacitor 8 (`@capacitor/android`), `html5-qrcode`, PWA Service Worker |
| **Derleme, Test & Kalite** | Vite 8, Vitest, Oxlint, GitHub Actions (Bulut APK Derleyici), Netlify |

---

## 🚀 Kurulum ve Çalıştırma

### 1. Repoyu Klonlayın ve Paketleri Yükleyin
```bash
git clone https://github.com/talha4111/sporproje.git
cd sporproje
npm install
```

### 2. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```

### 3. Birim Testleri ve Kod Kalitesi Kontrolü
```bash
npm run test
npm run lint
npm run build
```

### 4. Android APK Derleme (Capacitor)
```bash
npm run cap:sync
npm run cap:open:android
```

---

## 📂 Proje Klasör Yapısı
```text
sporproje/
├── src/
│   ├── components/       # Dashboard, VisionTab, BarcodeScanner, SmartCoach, MacroRing, WeeklyChart vb.
│   ├── services/         # aiVision.ts (Gemini Vision), aiCoach.ts (Macro Solver), foodApi.ts (OpenFoodFacts)
│   ├── store/            # useAppStore.ts (Zustand durum yönetimi)
│   ├── db/               # database.ts (Dexie.js IndexedDB şeması)
│   ├── data/             # turkishFoods.ts (Yerel besin veritabanı)
│   ├── utils/            # metabolism.ts & metabolism.test.ts (Mifflin-St Jeor BMR/TDEE motoru)
│   └── types/            # TypeScript veri modelleri ve arayüzler
├── android/              # Capacitor 8 yerel Android projesi
├── capacitor.config.json # Mobil uygulama yapılandırması
└── vite.config.ts        # Vite 8, PWA ve LAN senkronizasyon köprüsü ayarları
```

---

## 👨‍💻 Geliştirici
**Talha Gürler** — [GitHub (@talha4111)](https://github.com/talha4111)
