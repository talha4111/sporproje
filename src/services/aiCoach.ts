import type {
  CoachDebrief,
  FoodItem,
  Goal,
  MacroTargets,
  Nutrients,
  SmartMealSuggestion,
  SmartMealSuggestionItem,
} from '../types/nutrition';
import { scaleNutrients, sumNutrients } from '../utils/metabolism';
import { createId, normalizeText, toNumber } from '../utils/common';
import { getGeminiApiKey } from './aiVision';

// ─────────────────────────────────────────────────────────────
// Özellik 3: Kalan Makroya Göre Akıllı Öğün Önerisi (Macro Gap Solver)
// Özellik 6: Kişisel AI Beslenme Koçu (Daily Debrief)
// ─────────────────────────────────────────────────────────────

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const;

function clampGrams(g: number, min = 20, max = 350): number {
  return Math.round(Math.min(max, Math.max(min, g)) / 5) * 5;
}

function makeFoodItem(id: string, name: string, per100g: Nutrients): FoodItem {
  return {
    id,
    name,
    per100g,
    servings: [],
    source: 'seed',
    isFavorite: 0,
    searchName: normalizeText(name),
    createdAt: 0,
    lastUsedAt: 0,
  };
}

function buildItem(food: FoodItem, grams: number): SmartMealSuggestionItem {
  return {
    food,
    grams,
    nutrients: scaleNutrients(food.per100g, grams),
  };
}

/**
 * Kalan makroları kapatmak için 3 farklı sporcu öğün kombinasyonunu matematiksel olarak hesaplar.
 * İnternet veya API anahtarı gerektirmeden anında çalışır.
 */
export function solveMacroGap(
  targets: MacroTargets,
  consumed: Nutrients,
  foods: FoodItem[],
): SmartMealSuggestion[] {
  const remP = Math.max(0, targets.protein - consumed.protein);
  const remC = Math.max(0, targets.carbs - consumed.carbs);
  const remF = Math.max(0, targets.fat - consumed.fat);
  const remKcal = Math.max(0, targets.kcal - consumed.kcal);

  const targetP = remP > 8 ? remP : 25;
  const targetC = remC > 10 ? remC : 30;
  const targetF = remF > 5 ? remF : 10;

  const findFood = (id: string, fallbackName: string, per100g: Nutrients): FoodItem => {
    const found = foods.find((f) => f.id === id);
    return found ?? makeFoodItem(id, fallbackName, per100g);
  };

  const chicken = findFood('seed-chicken-cooked', 'Tavuk Göğsü (Pişmiş / Izgara)', {
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    fiber: 0,
    sugar: 0,
    salt: 0.19,
  });
  const rice = findFood('seed-rice-cooked', 'Beyaz Pirinç Pilavı (Pişmiş)', {
    kcal: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3,
    fiber: 0.4,
    sugar: 0.1,
    salt: 0.01,
  });
  const oliveOil = findFood('seed-olive-oil', 'Sızma Zeytinyağı', {
    kcal: 884,
    protein: 0,
    carbs: 0,
    fat: 100,
    fiber: 0,
    sugar: 0,
    salt: 0,
  });
  const oats = findFood('seed-oats', 'Yulaf Ezmesi', {
    kcal: 379,
    protein: 13.2,
    carbs: 67.7,
    fat: 6.5,
    fiber: 10.1,
    sugar: 0.9,
    salt: 0.01,
  });
  const whey = findFood('seed-whey', 'Whey Protein Tozu', {
    kcal: 120,
    protein: 24,
    carbs: 3,
    fat: 1.5,
    fiber: 0,
    sugar: 1.5,
    salt: 0.15,
  });
  const yogurt = findFood('seed-greek-yogurt', 'Süzme Yoğurt (Tam Yağlı)', {
    kcal: 133,
    protein: 9,
    carbs: 4.2,
    fat: 9,
    fiber: 0,
    sugar: 4,
    salt: 0.12,
  });
  const egg = findFood('seed-egg', 'Tam Yumurta (Haşlanmış)', {
    kcal: 155,
    protein: 12.6,
    carbs: 1.1,
    fat: 10.6,
    fiber: 0,
    sugar: 1.1,
    salt: 0.31,
  });
  const banana = findFood('seed-banana', 'Muz', {
    kcal: 89,
    protein: 1.1,
    carbs: 22.8,
    fat: 0.3,
    fiber: 2.6,
    sugar: 12.2,
    salt: 0,
  });
  const almonds = findFood('seed-almonds', 'Çiğ Badem', {
    kcal: 579,
    protein: 21.2,
    carbs: 21.6,
    fat: 49.9,
    fiber: 12.5,
    sugar: 4.4,
    salt: 0,
  });

  // 1. Öneri: Klasik Sporcu Ana Öğünü (Tavuk + Pilav + Zeytinyağı)
  const mealShare = remKcal > 900 ? 0.6 : 1;
  const pGoal = targetP * mealShare;
  const cGoal = targetC * mealShare;
  const fGoal = targetF * mealShare;

  const riceGrams = cGoal >= 12 ? clampGrams((cGoal / 28.2) * 100, 50, 320) : 0;
  const riceProtein = (riceGrams / 100) * rice.per100g.protein;
  const chickenGrams = clampGrams((Math.max(15, pGoal - riceProtein) / 31) * 100, 60, 280);
  const chickenFat = (chickenGrams / 100) * chicken.per100g.fat;
  const oilGrams = fGoal - chickenFat >= 5 ? clampGrams(fGoal - chickenFat, 5, 20) : 0;

  const items1: SmartMealSuggestionItem[] = [buildItem(chicken, chickenGrams)];
  if (riceGrams > 0) items1.push(buildItem(rice, riceGrams));
  if (oilGrams > 0) items1.push(buildItem(oliveOil, oilGrams));

  // 2. Öneri: Pratik & Tatlı Sporcu Kasesi (Whey + Yulaf + Badem)
  const oatsGrams = cGoal >= 15 ? clampGrams(((cGoal * 0.7) / 67.7) * 100, 35, 110) : 40;
  const oatsProtein = (oatsGrams / 100) * oats.per100g.protein;
  const wheyGrams = clampGrams((Math.max(15, pGoal - oatsProtein) / 24) * 100, 25, 60);
  const almondGrams = fGoal >= 10 ? clampGrams((Math.max(5, fGoal - 4) / 49.9) * 100, 10, 35) : 15;

  const items2: SmartMealSuggestionItem[] = [
    buildItem(oats, oatsGrams),
    buildItem(whey, wheyGrams),
    buildItem(almonds, almondGrams),
  ];

  // 3. Öneri: Kahvaltı / Hafif Toparlanma Tabağı (Yumurta + Süzme Yoğurt + Muz)
  const eggGrams = clampGrams((Math.min(pGoal * 0.55, 25) / 12.6) * 100, 50, 200);
  const yogurtGrams = clampGrams((Math.max(10, pGoal - (eggGrams / 100) * 12.6) / 9) * 100, 100, 250);
  const bananaGrams = cGoal >= 15 ? clampGrams(((cGoal - 8) / 22.8) * 100, 60, 180) : 0;

  const items3: SmartMealSuggestionItem[] = [
    buildItem(egg, eggGrams),
    buildItem(yogurt, yogurtGrams),
  ];
  if (bananaGrams > 0) items3.push(buildItem(banana, bananaGrams));

  return [
    {
      id: 'smart-athlete-plate',
      title: 'Tam İsabet Sporcu Tabağı',
      rationale:
        remKcal > 900
          ? `Kalan ${Math.round(remKcal)} kcal açığının ~%60'ını temiz protein ve kompleks karbonhidratla kapatır.`
          : `Kalan ${Math.round(remP)}g protein ve ${Math.round(remC)}g karbonhidrat açığını gramı gramına hedefler.`,
      items: items1,
      total: sumNutrients(items1.map((i) => i.nutrients)),
    },
    {
      id: 'smart-power-bowl',
      title: 'Pratik Pişirmesiz Power Bowl',
      rationale: 'Yüksek lifli yulaf, hızlı emilen whey protein ve sağlıklı yağ asitleriyle 3 dakikada hazır.',
      items: items2,
      total: sumNutrients(items2.map((i) => i.nutrients)),
    },
    {
      id: 'smart-recovery-mix',
      title: 'Doğal Protein & Yoğurt Tabağı',
      rationale: 'Katkısız tam yumurta ve süzme yoğurt kombinasyonuyla uzun süreli tokluk sağlar.',
      items: items3,
      total: sumNutrients(items3.map((i) => i.nutrients)),
    },
  ];
}

/**
 * Kullanıcının dolaptaki malzemelerine göre Gemini AI ile özel gramajlı öğün kombinasyonu üretir.
 */
export async function generateCustomMealWithAi(
  remaining: { kcal: number; protein: number; carbs: number; fat: number },
  ingredientsText: string,
): Promise<SmartMealSuggestion> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Özel malzeme tarifi için Gemini API anahtarı gerekiyor (Tabak Okut sekmesinden girebilirsiniz).');
  }

  const prompt = `Sen elit bir sporcu diyetisyenisin.
Kullanıcının bugünkü kalan makro açığı:
- Kalori: ${Math.max(150, Math.round(remaining.kcal))} kcal
- Protein: ${Math.max(15, Math.round(remaining.protein))} g
- Karbonhidrat: ${Math.max(10, Math.round(remaining.carbs))} g
- Yağ: ${Math.max(5, Math.round(remaining.fat))} g

Kullanıcının elindeki malzemeler / isteği: "${ingredientsText.trim() || 'Evdeki klasik sporcu malzemeleri'}"

Bu malzemeleri kullanarak kalan makrolara en yakın TEK BİR öğün kombinasyonu oluştur.
Yanıtı SADECE aşağıdaki JSON şemasında ver:
{
  "title": "Öğün başlığı (Türkçe)",
  "rationale": "Neden bu gramajların seçildiğine dair 1 cümlelik açıklama",
  "items": [
    {
      "name": "Besin adı (Türkçe, pişirme durumu belirtilmiş)",
      "grams": 150,
      "per100g": {
        "kcal": 160,
        "protein": 23,
        "carbs": 0,
        "fat": 5,
        "fiber": 0,
        "sugar": 0,
        "salt": 0.2
      }
    }
  ]
}`;

  let lastErr = 'AI yanıt vermedi.';
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.25 },
      }),
    });
    if (!res.ok) {
      lastErr = `HTTP ${res.status}`;
      continue;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as {
      title?: string;
      rationale?: string;
      items?: Array<{ name?: string; grams?: number; per100g?: Partial<Nutrients> }>;
    };

    const items: SmartMealSuggestionItem[] = (parsed.items ?? []).map((it) => {
      const n = it.per100g ?? {};
      const per100g: Nutrients = {
        kcal: Math.round(toNumber(n.kcal, 100)),
        protein: Math.round(toNumber(n.protein, 0) * 10) / 10,
        carbs: Math.round(toNumber(n.carbs, 0) * 10) / 10,
        fat: Math.round(toNumber(n.fat, 0) * 10) / 10,
        fiber: Math.round(toNumber(n.fiber, 0) * 10) / 10,
        sugar: Math.round(toNumber(n.sugar, 0) * 10) / 10,
        salt: Math.round(toNumber(n.salt, 0) * 100) / 100,
      };
      const grams = Math.max(5, Math.round(toNumber(it.grams, 100)));
      const food = makeFoodItem(createId('ai-food'), String(it.name ?? 'Özel Besin'), per100g);
      return buildItem(food, grams);
    });

    if (items.length === 0) throw new Error('Öğün kalemleri oluşturulamadı.');

    return {
      id: createId('ai-custom'),
      title: parsed.title ?? 'AI Özel Dolap Kombinasyonu',
      rationale: parsed.rationale ?? 'Dolabındaki malzemelerle kalan makrolarına göre optimize edildi.',
      items,
      total: sumNutrients(items.map((i) => i.nutrients)),
    };
  }

  throw new Error(lastErr);
}

/**
 * Özellik 6: Günlük Beslenme Koçu Karnesi (Daily Debrief).
 * Makro uyumu, lif, şeker, tuz ve su tüketimini değerlendirerek 0-100 arası puan ve koçluk tavsiyesi üretir.
 */
export function buildDailyDebrief(
  targets: MacroTargets,
  consumed: Nutrients,
  waterMl: number,
  waterTargetMl: number,
  goal: Goal,
  mealCount: number,
): CoachDebrief {
  if (mealCount === 0) {
    return {
      score: 0,
      badge: 'Güne Başlangıç',
      summary: 'Bugün henüz öğün kaydı girilmedi. İlk öğününü ekleyerek veya tabağını kamerayla okutarak koç analizini başlatabilirsin.',
      strengths: ['Hedef kalorin ve makroların hazır'],
      improvements: ['İlk öğününü kaydet', `Gün boyu ${(waterTargetMl / 1000).toFixed(1)} L su hedefine odaklan`],
      nextActionTip: 'Kahvaltı veya antrenman öncesi öğününü ekleyerek başla.',
    };
  }

  const kcalRatio = targets.kcal > 0 ? consumed.kcal / targets.kcal : 0;
  const proteinRatio = targets.protein > 0 ? consumed.protein / targets.protein : 0;
  const waterRatio = waterTargetMl > 0 ? waterMl / waterTargetMl : 0;

  let score = 50;
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (proteinRatio >= 0.9 && proteinRatio <= 1.25) {
    score += 25;
    strengths.push(`Protein hedefini harika yakaladın (${Math.round(consumed.protein)}g / ${targets.protein}g).`);
  } else if (proteinRatio >= 0.7) {
    score += 15;
    improvements.push(`Protein hedefine ${Math.round(targets.protein - consumed.protein)}g kaldı; son öğünde yağsız protein ekle.`);
  } else {
    improvements.push(`Protein alımı henüz düşük (%${Math.round(proteinRatio * 100)}). Kas korumu için protein öncelikli beslen.`);
  }

  if (kcalRatio >= 0.85 && kcalRatio <= 1.1) {
    score += 15;
    strengths.push(`Kalori bütçene sadık kaldın (${Math.round(consumed.kcal)} / ${targets.kcal} kcal).`);
  } else if (goal === 'lose' && kcalRatio > 1.1) {
    score -= 10;
    improvements.push(`Definasyon hedefinin ${Math.round(consumed.kcal - targets.kcal)} kcal üzerindesin.`);
  } else if (goal === 'gain' && kcalRatio < 0.8) {
    improvements.push(`Hacim hedefi için ${Math.round(targets.kcal - consumed.kcal)} kcal daha enerjiye ihtiyacın var.`);
  }

  if (consumed.fiber >= 25) {
    score += 10;
    strengths.push(`Günlük lif tüketimin çok iyi (${Math.round(consumed.fiber)}g) — sindirim ve tokluk için ideal.`);
  } else if (consumed.fiber < 15 && consumed.kcal > 1000) {
    improvements.push(`Lif alımın düşük (${Math.round(consumed.fiber)}g). Yulaf, bakliyat veya yeşil sebze ekleyebilirsin.`);
  }

  if (consumed.sugar > 50) {
    score -= 8;
    improvements.push(`Günlük şeker alımı yüksek (${Math.round(consumed.sugar)}g). İnsülin dalgalanmasına dikkat.`);
  } else if (consumed.sugar <= 25 && consumed.kcal > 800) {
    score += 5;
    strengths.push(`Şeker tüketimin çok temiz seviyede (${Math.round(consumed.sugar)}g).`);
  }

  if (consumed.salt > 6) {
    score -= 5;
    improvements.push(`Tuz/sodyum alımı yüksek (${consumed.salt.toFixed(1)}g). Ödem tutmamak için suyu artır.`);
  }

  if (waterRatio >= 0.85) {
    score += 10;
    strengths.push(`Hidrasyon hedefin yolunda (${(waterMl / 1000).toFixed(1)} L).`);
  } else {
    improvements.push(`Su tüketimin geride (${(waterMl / 1000).toFixed(1)} / ${(waterTargetMl / 1000).toFixed(1)} L).`);
  }

  const finalScore = Math.max(15, Math.min(100, Math.round(score)));
  const badge =
    finalScore >= 85
      ? 'Elit Sporcu Disiplini 🏆'
      : finalScore >= 70
        ? 'Dengeli & Güçlü 💪'
        : finalScore >= 50
          ? 'Gelişime Açık ⚡'
          : 'Makro Dengeleme Zamanı 🎯';

  const summary =
    finalScore >= 80
      ? 'Bugünkü makro dağılımın ve besin kaliten hedefinle yüksek uyum içinde.'
      : 'Günlük hedeflerine yaklaşmak için aşağıdaki makro ve mikro besin noktalarını optimize edebilirsin.';

  const nextActionTip =
    proteinRatio < 0.85
      ? `Bir sonraki öğününde ~${Math.min(45, Math.round(targets.protein - consumed.protein))}g protein içeren temiz bir kaynak (tavuk, yumurta, süzme yoğurt veya whey) tercih et.`
      : consumed.fiber < 20
        ? 'Sonraki öğününe 1 porsiyon yeşil salata veya yulaf ekleyerek lif dengesini tamamla.'
        : 'Günü kapatırken su hedefini tamamla ve kas onarımı için uyku düzenine dikkat et.';

  return {
    score: finalScore,
    badge,
    summary,
    strengths: strengths.length > 0 ? strengths : ['Öğün takibini düzenli sürdürüyorsun.'],
    improvements: improvements.length > 0 ? improvements : ['Tüm temel metrikler hedef aralığında!'],
    nextActionTip,
  };
}
