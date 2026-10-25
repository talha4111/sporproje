import type {
  ActivityLevel,
  Goal,
  MacroPercentages,
  MacroTargets,
  Nutrients,
  UserProfile,
} from '../types/nutrition';
import { EMPTY_NUTRIENTS } from '../types/nutrition';

// ─────────────────────────────────────────────────────────────
// Metabolizma motoru — yan etkisiz (pure) fonksiyonlar.
// ─────────────────────────────────────────────────────────────

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Readonly<Record<ActivityLevel, string>> = {
  sedentary: 'Hareketsiz (masa başı)',
  light: 'Hafif aktif (haftada 1–3 antrenman)',
  moderate: 'Orta aktif (haftada 3–5 antrenman)',
  active: 'Çok aktif (haftada 6–7 antrenman)',
  very_active: 'Aşırı aktif (günde 2 antrenman / fiziksel iş)',
};

/** TDEE üzerine uygulanan hedef çarpanları. */
export const GOAL_ADJUSTMENTS: Readonly<Record<Goal, number>> = {
  lose: -0.2,
  maintain: 0,
  gain: 0.15,
};

export const GOAL_LABELS: Readonly<Record<Goal, string>> = {
  lose: 'Kilo ver (−%20)',
  maintain: 'Kiloyu koru',
  gain: 'Kilo al (+%15)',
};

/** Vücut ağırlığı modunda yağın toplam kaloriden aldığı pay. */
export const BODYWEIGHT_MODE_FAT_RATIO = 0.25;

/** Mifflin-St Jeor: BMR = 10·kg + 6.25·cm − 5·yaş + s (erkek +5, kadın −161) */
export function calculateBMR(p: Pick<UserProfile, 'sex' | 'weightKg' | 'heightCm' | 'age'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.sex === 'male' ? 5 : -161);
}

export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activity];
}

export function applyGoal(tdee: number, goal: Goal): number {
  return tdee * (1 + GOAL_ADJUSTMENTS[goal]);
}

export function percentageSum(p: MacroPercentages): number {
  return p.protein + p.carbs + p.fat;
}

interface MacroGrams {
  protein: number;
  carbs: number;
  fat: number;
  warnings: string[];
}

/** Sporcu standardı: Protein = x g/kg, Yağ = kalorinin %25'i, Karbonhidrat = kalan. */
export function bodyweightMacros(kcal: number, weightKg: number, proteinPerKg = 2): MacroGrams {
  const warnings: string[] = [];
  const protein = proteinPerKg * weightKg;
  const fat = (kcal * BODYWEIGHT_MODE_FAT_RATIO) / KCAL_PER_GRAM.fat;
  const remaining = kcal - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat;

  if (remaining < 0) {
    warnings.push(
      `Protein ve yağ hedefleri toplam kaloriyi ${Math.round(-remaining)} kcal aşıyor; karbonhidrat 0 g olarak sabitlendi. Kalori hedefini artırmayı veya kg başına proteini düşürmeyi düşünün.`,
    );
  }
  return { protein, fat, carbs: Math.max(0, remaining) / KCAL_PER_GRAM.carbs, warnings };
}

/** Yüzde odaklı dağılım. Toplam 100 değilse orantılı olarak normalize edilir. */
export function percentageMacros(kcal: number, pct: MacroPercentages): MacroGrams {
  const warnings: string[] = [];
  const sum = percentageSum(pct);
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

  if (sum <= 0) {
    warnings.push('Makro yüzdeleri geçersiz; varsayılan 30/45/25 dağılımı kullanıldı.');
    return percentageMacros(kcal, { protein: 30, carbs: 45, fat: 25 });
  }
  if (Math.round(sum) !== 100) {
    warnings.push(`Makro yüzdelerinin toplamı %${Math.round(sum)}; hesaplama %100'e normalize edildi.`);
  }
  const factor = 100 / sum;
  return {
    protein: (kcal * (safe(pct.protein) * factor)) / 100 / KCAL_PER_GRAM.protein,
    carbs: (kcal * (safe(pct.carbs) * factor)) / 100 / KCAL_PER_GRAM.carbs,
    fat: (kcal * (safe(pct.fat) * factor)) / 100 / KCAL_PER_GRAM.fat,
    warnings,
  };
}

export function calculateTargets(profile: UserProfile): MacroTargets {
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(bmr, profile.activityLevel);
  const kcal = applyGoal(tdee, profile.goal);

  const macros =
    profile.macroMode === 'bodyweight'
      ? bodyweightMacros(kcal, profile.weightKg, profile.proteinPerKg)
      : percentageMacros(kcal, profile.percentages);

  const warnings = [...macros.warnings];
  if (kcal < bmr) {
    warnings.push('Kalori hedefi bazal metabolizma hızının (BMR) altında; uzun süre uygulanması önerilmez.');
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    protein: Math.round(macros.protein),
    carbs: Math.round(macros.carbs),
    fat: Math.round(macros.fat),
    warnings,
  };
}

// ─── Porsiyon matematiği ─────────────────────────────────────

/** Makrolardan kalori: P·4 + K·4 + Y·9 */
export function kcalFromMacros(protein: number, carbs: number, fat: number): number {
  return protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fat * KCAL_PER_GRAM.fat;
}

/** değer = (baz_100g × gram) / 100 */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const g = Number.isFinite(grams) && grams > 0 ? grams : 0;
  const s = (v: number) => (v * g) / 100;
  return {
    kcal: s(per100g.kcal),
    protein: s(per100g.protein),
    carbs: s(per100g.carbs),
    fat: s(per100g.fat),
    fiber: s(per100g.fiber),
    sugar: s(per100g.sugar),
    salt: s(per100g.salt),
  };
}

export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  return list.reduce<Nutrients>(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      carbs: acc.carbs + n.carbs,
      fat: acc.fat + n.fat,
      fiber: acc.fiber + n.fiber,
      sugar: acc.sugar + n.sugar,
      salt: acc.salt + n.salt,
    }),
    { ...EMPTY_NUTRIENTS },
  );
}

/** Gösterim için yuvarlama: kalori tam sayı, diğerleri 1 ondalık. */
export function formatAmount(value: number, decimals = 1): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toLocaleString('tr-TR', { maximumFractionDigits: decimals });
}
