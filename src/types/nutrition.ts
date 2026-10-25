// ─────────────────────────────────────────────────────────────
// Alan modeli (Domain types) — kesinlikle `any` yok.
// ─────────────────────────────────────────────────────────────

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_CATEGORIES: readonly MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_CATEGORY_LABELS: Readonly<Record<MealCategory, string>> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle Yemeği',
  dinner: 'Akşam Yemeği',
  snack: 'Ara Öğün / Antrenman Sonrası',
};

export type Sex = 'male' | 'female';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type Goal = 'lose' | 'maintain' | 'gain';

export type MacroMode = 'bodyweight' | 'percentage';

/** Yüzde odaklı modda kullanıcının belirlediği dağılım (toplam 100 olmalı). */
export interface MacroPercentages {
  protein: number;
  carbs: number;
  fat: number;
}

export interface UserProfile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  macroMode: MacroMode;
  percentages: MacroPercentages;
  /** Vücut ağırlığı modunda kg başına protein (varsayılan 2.0 g). */
  proteinPerKg: number;
  waterTargetMl: number;
}

/** Besin değerleri. Bağlama göre 100g baz ya da ölçeklenmiş porsiyon olabilir. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  salt: number;
}

export interface MacroTargets {
  bmr: number;
  tdee: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Kullanıcıya gösterilecek hesaplama uyarıları (örn. negatif karbonhidrat). */
  warnings: string[];
}

export type FoodSource = 'seed' | 'api' | 'custom' | 'vision';

/** Porsiyon kısayolu, örn. "1 adet yumurta" = 50 g. */
export interface ServingPreset {
  label: string;
  grams: number;
}

export type NovaGroup = 1 | 2 | 3 | 4;
export type NutriScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/** 4. Madde: Barkod & ürün temiz beslenme / katkı maddesi radarı */
export interface HealthRadar {
  novaGroup?: NovaGroup;
  nutriScore?: NutriScoreGrade;
  additivesCount: number;
  warnings: string[];
  positives: string[];
  cleanerAlternative?: string;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  imageUrl?: string;
  /** 100 g baz değerleri. */
  per100g: Nutrients;
  servings: ServingPreset[];
  source: FoodSource;
  /** IndexedDB boolean indekslemediği için 0 | 1 tutulur. */
  isFavorite: 0 | 1;
  /** Türkçe karakterlerden arındırılmış, küçük harfli arama anahtarı. */
  searchName: string;
  healthRadar?: HealthRadar;
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Öğün kaydı. Besinin o anki 100 g değerleri kopyalanır (snapshot);
 * böylece kayıtlı besin sonradan düzenlense bile geçmiş değişmez.
 */
export interface MealLog {
  id: string;
  /** Yerel saat dilimine göre YYYY-MM-DD. */
  date: string;
  category: MealCategory;
  foodId: string;
  foodName: string;
  brand?: string;
  grams: number;
  per100g: Nutrients;
  /** `per100g` × gram / 100 — önceden hesaplanmış porsiyon değerleri. */
  nutrients: Nutrients;
  createdAt: number;
}

export interface WeightEntry {
  date: string;
  weightKg: number;
}

export type VisionConfidence = 'high' | 'medium' | 'low';

/** Yapay zeka tabak analizinde tespit edilen tekil besin kalemi. */
export interface VisionDetectedItem {
  id: string;
  name: string;
  estimatedGrams: number;
  confidence: VisionConfidence;
  per100g: Nutrients;
  note?: string;
  selected: boolean;
}

/** Yapay zeka tabak analizi sonucu. */
export interface VisionPlateAnalysis {
  mealTitle: string;
  summaryNote: string;
  items: VisionDetectedItem[];
  isDemo?: boolean;
}

/** 3. Madde: Kalan makroya göre akıllı öğün önerisi (Macro Gap Solver) */
export interface SmartMealSuggestionItem {
  food: FoodItem;
  grams: number;
  nutrients: Nutrients;
}

export interface SmartMealSuggestion {
  id: string;
  title: string;
  rationale: string;
  items: SmartMealSuggestionItem[];
  total: Nutrients;
}

/** 6. Madde: Kişisel AI Beslenme Koçu (Daily Debrief) */
export interface CoachDebrief {
  score: number;
  badge: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  nextActionTip: string;
}

export const EMPTY_NUTRIENTS: Readonly<Nutrients> = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  salt: 0,
};
