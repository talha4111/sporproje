import type {
  FoodItem,
  Nutrients,
  VisionConfidence,
  VisionDetectedItem,
  VisionPlateAnalysis,
} from '../types/nutrition';
import { createId, normalizeText, toNumber } from '../utils/common';
import { kcalFromMacros } from '../utils/metabolism';

// ─────────────────────────────────────────────────────────────
// Yapay Zeka Tabak ve Yemek Analizi Servisi (Gemini Vision API)
// ─────────────────────────────────────────────────────────────

const API_KEY_STORAGE_KEY = 'makro-takip-gemini-key';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const;

export interface BridgeInfo {
  ips: string[];
  port: number;
  https: boolean;
  urls: string[];
  geminiApiKey: string;
  sharedStoreJson: string | null;
  updatedAt: number;
}

export function getGeminiApiKey(): string {
  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  if (envKey) return envKey;
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem(API_KEY_STORAGE_KEY) ?? '').trim();
}

export function setGeminiApiKey(key: string, syncToBridge = true): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
  else localStorage.removeItem(API_KEY_STORAGE_KEY);

  if (syncToBridge) {
    void fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey: trimmed }),
    }).catch(() => undefined);
  }
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 10;
}

/** Bilgisayarda girilen API anahtarını telefona (veya tam tersi) yerel ağ üzerinden otomatik eşitler. */
export async function syncGeminiKeyFromBridge(): Promise<string> {
  const current = getGeminiApiKey();
  try {
    const res = await fetch('/api/bridge');
    if (!res.ok) return current;
    const data = (await res.json()) as Partial<BridgeInfo>;
    const bridgeKey = (data.geminiApiKey ?? '').trim();
    if (!current && bridgeKey.length > 10) {
      setGeminiApiKey(bridgeKey, false);
      return bridgeKey;
    }
    if (current.length > 10 && !bridgeKey) {
      void fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: current }),
      }).catch(() => undefined);
    }
  } catch {
    /* Çevrimdışı veya statik sunucu */
  }
  return current;
}

// ─── Ham JSON şeması doğrulama & temizleme ────────────────────

interface RawVisionItem {
  name?: unknown;
  estimatedGrams?: unknown;
  confidence?: unknown;
  note?: unknown;
  per100g?: Record<string, unknown>;
}

interface RawVisionResponse {
  mealTitle?: unknown;
  summaryNote?: unknown;
  items?: unknown;
}

const cleanNum = (v: unknown, fallback = 0): number => Math.max(0, toNumber(v, fallback));

function sanitizeVisionNutrients(raw: Record<string, unknown> | undefined): Nutrients {
  const r = raw ?? {};
  const protein = Math.round(cleanNum(r.protein) * 10) / 10;
  const carbs = Math.round(cleanNum(r.carbs) * 10) / 10;
  const fat = Math.round(cleanNum(r.fat) * 10) / 10;
  const rawKcal = cleanNum(r.kcal);
  const kcal = Math.round(rawKcal > 0 ? rawKcal : kcalFromMacros(protein, carbs, fat));

  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber: Math.round(cleanNum(r.fiber) * 10) / 10,
    sugar: Math.round(cleanNum(r.sugar) * 10) / 10,
    salt: Math.round(cleanNum(r.salt) * 100) / 100,
  };
}

function parseConfidence(v: unknown): VisionConfidence {
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'medium';
}

function parseVisionResponse(text: string): VisionPlateAnalysis {
  // Olası ```json ... ``` sarmalayıcısını temizle
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: RawVisionResponse;
  try {
    parsed = JSON.parse(cleaned) as RawVisionResponse;
  } catch {
    throw new Error('Yapay zeka yanıtı ayrıştırılamadı. Lütfen fotoğrafı tekrar çekip deneyin.');
  }

  const rawItems = Array.isArray(parsed.items) ? (parsed.items as RawVisionItem[]) : [];
  const items: VisionDetectedItem[] = rawItems.flatMap((item) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return [];
    const estimatedGrams = Math.max(5, Math.round(cleanNum(item.estimatedGrams, 100)));
    return [
      {
        id: createId('vis'),
        name,
        estimatedGrams,
        confidence: parseConfidence(item.confidence),
        per100g: sanitizeVisionNutrients(
          typeof item.per100g === 'object' && item.per100g !== null
            ? (item.per100g as Record<string, unknown>)
            : undefined,
        ),
        note: typeof item.note === 'string' && item.note.trim() ? item.note.trim() : undefined,
        selected: true,
      },
    ];
  });

  if (items.length === 0) {
    throw new Error('Görselde tanımlanabilir bir yiyecek veya içecek tespit edilemedi.');
  }

  return {
    mealTitle:
      typeof parsed.mealTitle === 'string' && parsed.mealTitle.trim()
        ? parsed.mealTitle.trim()
        : 'Tabak Analizi',
    summaryNote:
      typeof parsed.summaryNote === 'string' && parsed.summaryNote.trim()
        ? parsed.summaryNote.trim()
        : 'Porsiyon gramajlarını tabağınıza göre aşağıdan hassaslaştırabilirsiniz.',
    items,
  };
}

const SYSTEM_PROMPT = `Sen uzman bir sporcu diyetisyeni ve görsel porsiyon tahmin motorusun.
Kullanıcının gönderdiği yemek/yiyecek fotoğrafını incele ve tabaktaki/görseldeki TÜM yiyecek veya içecek kalemlerini ayrı ayrı tespit et.

Kurallar:
1. Yanıtın SADECE geçerli bir JSON nesnesi olmalı. Tüm isimler ve notlar TÜRKÇE olmalı.
2. Pişirme yöntemini dikkate al (örn. "Tavuk Göğsü (pişmiş, ızgara)", "Pirinç Pilavı (pişmiş, tereyağlı)", "Patates Kızartması").
3. Tabak boyutunu, çatal/kaşık referanslarını ve yemek hacmini baz alarak gerçekçi gramaj ("estimatedGrams") tahmin et.
4. "per100g" alanına her besinin 100 gramı için gerçekçi besin değerlerini (kcal, protein, carbs, fat, fiber, sugar, salt) yaz.
5. Eğer görselde yemek/gıda yoksa items dizisini boş döndür.

JSON Şeması:
{
  "mealTitle": "Kısa öğün başlığı (örn. Izgara Tavuk ve Pilav Tabağı)",
  "summaryNote": "Tabak hakkında 1 cümlelik sporcu beslenme yorumu (örn. Yüksek proteinli, antrenman sonrası için dengeli bir öğün.)",
  "items": [
    {
      "name": "Besin adı (pişirme durumuyla)",
      "estimatedGrams": 180,
      "confidence": "high" | "medium" | "low",
      "note": "Kısa porsiyon ipucu (örn. ~1 orta boy fileto)",
      "per100g": {
        "kcal": 165,
        "protein": 31,
        "carbs": 0,
        "fat": 3.6,
        "fiber": 0,
        "sugar": 0,
        "salt": 0.2
      }
    }
  ]
}`;

export async function analyzeFoodImageWithAI(
  base64Image: string,
  mimeType: string,
  userHint?: string,
  signal?: AbortSignal,
): Promise<VisionPlateAnalysis> {
  const apiKey = await syncGeminiKeyFromBridge();
  if (!apiKey) {
    throw new Error('GEMINI_KEY_MISSING');
  }

  const promptText = userHint?.trim()
    ? `${SYSTEM_PROMPT}\n\nKullanıcının ek notu / ipucu: "${userHint.trim()}"`
    : SYSTEM_PROMPT;

  let lastError = 'Yapay zeka servisine ulaşılamadı.';

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      if (res.status === 400 || res.status === 403) {
        throw new Error('Gemini API anahtarı geçersiz veya yetkisiz. Lütfen anahtarınızı kontrol edin.');
      }
      if (res.status === 429) {
        throw new Error('Gemini API kota sınırına ulaşıldı. Birkaç saniye sonra tekrar deneyin.');
      }
      lastError = `AI sunucu hatası (${res.status})`;
      continue;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Yapay zekadan boş yanıt döndü.');
    }

    return parseVisionResponse(rawText);
  }

  throw new Error(lastError);
}

/** Tespit edilen AI kalemini uygulamanın standart `FoodItem` modeline dönüştürür. */
export function visionItemToFoodItem(item: VisionDetectedItem): FoodItem {
  return {
    id: `vis-${normalizeText(item.name).replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
    name: item.name,
    brand: 'AI Kamera Analizi',
    per100g: { ...item.per100g },
    servings: [
      {
        label: item.note ? `Tahmini porsiyon (${item.note})` : 'Tahmini porsiyon',
        grams: item.estimatedGrams,
      },
    ],
    source: 'vision',
    isFavorite: 0,
    searchName: normalizeText(item.name),
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

// ─── Hazır Örnek Sporcu Tabakları (API anahtarı olmadan da anında test için) ───

export interface DemoPlatePreset {
  id: string;
  label: string;
  emoji: string;
  analysis: VisionPlateAnalysis;
}

export const DEMO_PLATES: readonly DemoPlatePreset[] = [
  {
    id: 'chicken-rice',
    label: 'Tavuk & Pilav Tabağı',
    emoji: '🍗',
    analysis: {
      mealTitle: 'Sporcu Klasik: Izgara Tavuk, Pirinç Pilavı ve Salata',
      summaryNote: 'Antrenman sonrası kas onarımı ve glikojen depoları için ideal yüksek proteinli öğün.',
      isDemo: true,
      items: [
        {
          id: 'demo-1',
          name: 'Tavuk Göğsü (pişmiş, ızgara)',
          estimatedGrams: 180,
          confidence: 'high',
          note: '1 büyük fileto',
          per100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, salt: 0.19 },
          selected: true,
        },
        {
          id: 'demo-2',
          name: 'Pirinç Pilavı (pişmiş, az yağlı)',
          estimatedGrams: 200,
          confidence: 'high',
          note: '~6 yemek kaşığı tepeleme',
          per100g: { kcal: 145, protein: 2.7, carbs: 28, fat: 2.4, fiber: 0.4, sugar: 0.1, salt: 0.35 },
          selected: true,
        },
        {
          id: 'demo-3',
          name: 'Akdeniz Yeşillik & Domates Salatası',
          estimatedGrams: 120,
          confidence: 'medium',
          note: '1 orta kase',
          per100g: { kcal: 22, protein: 1.1, carbs: 3.8, fat: 0.3, fiber: 1.6, sugar: 2.1, salt: 0.05 },
          selected: true,
        },
        {
          id: 'demo-4',
          name: 'Sızma Zeytinyağı (salata sosu)',
          estimatedGrams: 8,
          confidence: 'low',
          note: '~1.5 tatlı kaşığı',
          per100g: { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0, salt: 0 },
          selected: true,
        },
      ],
    },
  },
  {
    id: 'power-breakfast',
    label: 'Protein Kahvaltı Tabağı',
    emoji: '🍳',
    analysis: {
      mealTitle: 'Yüksek Proteinli Sporcu Kahvaltısı',
      summaryNote: 'Yumurta, lor peyniri ve yulafla uzun süre tok tutan dengeli makro dağılımı.',
      isDemo: true,
      items: [
        {
          id: 'demo-b1',
          name: 'Haşlanmış Yumurta (tam)',
          estimatedGrams: 150,
          confidence: 'high',
          note: '3 adet orta boy',
          per100g: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0, sugar: 0.4, salt: 0.36 },
          selected: true,
        },
        {
          id: 'demo-b2',
          name: 'Kahvaltılık Lor Peyniri',
          estimatedGrams: 80,
          confidence: 'high',
          note: '4 yemek kaşığı',
          per100g: { kcal: 97, protein: 12, carbs: 3, fat: 4.2, fiber: 0, sugar: 3, salt: 0.8 },
          selected: true,
        },
        {
          id: 'demo-b3',
          name: 'Yulaf Ezmesi',
          estimatedGrams: 50,
          confidence: 'high',
          note: '5 yemek kaşığı',
          per100g: { kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1, sugar: 1, salt: 0.02 },
          selected: true,
        },
        {
          id: 'demo-b4',
          name: 'Muz (dilimlenmiş)',
          estimatedGrams: 110,
          confidence: 'medium',
          note: '1 orta boy',
          per100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6, sugar: 12.2, salt: 0 },
          selected: true,
        },
      ],
    },
  },
  {
    id: 'salmon-dinner',
    label: 'Somon & Tatlı Patates',
    emoji: '🐟',
    analysis: {
      mealTitle: 'Fırın Somon, Tatlı Patates ve Brokoli',
      summaryNote: 'Omega-3 yağ asitleri, kompleks karbonhidrat ve yüksek mikro besin içerikli akşam öğünü.',
      isDemo: true,
      items: [
        {
          id: 'demo-s1',
          name: 'Fırın Somon Fileto',
          estimatedGrams: 170,
          confidence: 'high',
          note: '1 porsiyon dilim',
          per100g: { kcal: 206, protein: 22.1, carbs: 0, fat: 12.4, fiber: 0, sugar: 0, salt: 0.15 },
          selected: true,
        },
        {
          id: 'demo-s2',
          name: 'Fırınlanmış Tatlı Patates',
          estimatedGrams: 160,
          confidence: 'medium',
          note: '1 orta boy küp doğranmış',
          per100g: { kcal: 90, protein: 2, carbs: 20.7, fat: 0.2, fiber: 3.3, sugar: 6.5, salt: 0.09 },
          selected: true,
        },
        {
          id: 'demo-s3',
          name: 'Buharda Brokoli',
          estimatedGrams: 120,
          confidence: 'high',
          note: '1 kase çiçek',
          per100g: { kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4, fiber: 3.3, sugar: 1.4, salt: 0.04 },
          selected: true,
        },
      ],
    },
  },
];
