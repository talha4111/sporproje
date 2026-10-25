import Dexie, { type EntityTable } from 'dexie';
import type { FoodItem, Nutrients, ServingPreset } from '../types/nutrition';
import { normalizeText } from '../utils/common';

// ─────────────────────────────────────────────────────────────
// IndexedDB (Dexie) — besin önbelleği, favoriler ve özel besinler.
// ─────────────────────────────────────────────────────────────

export class NutritionDB extends Dexie {
  foods!: EntityTable<FoodItem, 'id'>;

  constructor() {
    super('makro-takip-db');
    this.version(1).stores({
      // Birincil anahtar: id. Diğerleri sorgulama indeksleri.
      foods: 'id, barcode, searchName, source, isFavorite, lastUsedAt',
    });

    // Yalnızca veritabanı ilk oluşturulduğunda çalışır.
    this.on('populate', (tx) => tx.table<FoodItem, string>('foods').bulkAdd(SEED_FOODS));
  }
}

const n = (
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber = 0,
  sugar = 0,
  salt = 0,
): Nutrients => ({ kcal, protein, carbs, fat, fiber, sugar, salt });

function seed(id: string, name: string, per100g: Nutrients, servings: ServingPreset[]): FoodItem {
  return {
    id: `seed-${id}`,
    name,
    per100g,
    servings,
    source: 'seed',
    isFavorite: 1,
    searchName: normalizeText(name),
    createdAt: 0,
    lastUsedAt: 0,
  };
}

/**
 * Türkiye'de sık tüketilen temel sporcu besinleri (100 g baz değerleri).
 * Kaynak: USDA FoodData Central ve yaygın Türk market etiketleri ortalaması.
 * Tavuk ve pirinç için hem çiğ hem pişmiş değerler ayrı tutulur —
 * pişirme su kaybı/kazancı nedeniyle 100 g'daki değerler ciddi şekilde farklıdır.
 */
export const SEED_FOODS: FoodItem[] = [
  seed('yulaf', 'Yulaf Ezmesi', n(379, 13.2, 67.7, 6.5, 10.1, 1, 0.02), [
    { label: '1 yemek kaşığı', grams: 10 },
    { label: '1 kase', grams: 50 },
  ]),
  seed('tavuk-cig', 'Tavuk Göğsü (çiğ)', n(120, 22.5, 0, 2.6, 0, 0, 0.11), [
    { label: '1 adet fileto', grams: 200 },
  ]),
  seed('tavuk-pismis', 'Tavuk Göğsü (pişmiş, ızgara)', n(165, 31, 0, 3.6, 0, 0, 0.19), [
    { label: '1 porsiyon', grams: 150 },
  ]),
  seed('pirinc-cig', 'Pilavlık Pirinç (çiğ)', n(365, 7.1, 80, 0.7, 1.3, 0.1, 0.01), [
    { label: '1 yemek kaşığı', grams: 15 },
    { label: '1 su bardağı', grams: 180 },
  ]),
  seed('pirinc-haslama', 'Pirinç (pişmiş, yağsız haşlama)', n(130, 2.7, 28.2, 0.3, 0.4, 0.1, 0.01), [
    { label: '1 servis kaşığı', grams: 50 },
    { label: '1 porsiyon', grams: 150 },
  ]),
  seed('pirinc-pilav', 'Pirinç Pilavı (pişmiş, tereyağlı)', n(155, 2.7, 28, 3.6, 0.4, 0.1, 0.4), [
    { label: '1 servis kaşığı', grams: 50 },
    { label: '1 porsiyon', grams: 150 },
  ]),
  seed('yumurta', 'Yumurta (bütün)', n(143, 12.6, 0.7, 9.5, 0, 0.4, 0.36), [
    { label: '1 adet (M)', grams: 50 },
    { label: '1 adet (L)', grams: 60 },
  ]),
  seed('lor', 'Lor Peyniri', n(97, 12, 3, 4.2, 0, 3, 0.8), [
    { label: '1 yemek kaşığı', grams: 20 },
    { label: '1 kase', grams: 100 },
  ]),
  seed('whey', 'Whey Protein Tozu', n(398, 78, 8, 6, 0, 5, 0.5), [
    { label: '1 ölçek', grams: 30 },
  ]),
  seed('zeytinyagi', 'Zeytinyağı', n(884, 0, 0, 100), [
    { label: '1 tatlı kaşığı', grams: 5 },
    { label: '1 yemek kaşığı', grams: 13 },
  ]),
  seed('fistik-ezmesi', 'Fıstık Ezmesi', n(588, 25, 20, 50, 6, 9, 0.4), [
    { label: '1 tatlı kaşığı', grams: 8 },
    { label: '1 yemek kaşığı', grams: 16 },
  ]),
  seed('muz', 'Muz', n(89, 1.1, 22.8, 0.3, 2.6, 12.2, 0), [
    { label: '1 adet (orta, soyulmuş)', grams: 120 },
  ]),
  seed('sut', 'Tam Yağlı Süt', n(61, 3.2, 4.8, 3.3, 0, 4.8, 0.1), [
    { label: '1 su bardağı (200 ml)', grams: 206 },
  ]),
];

export const db = new NutritionDB();

// ─── Yardımcı sorgular ────────────────────────────────────────

/** Yeni besini kaydeder; mevcutsa kullanıcıya ait alanları (favori, son kullanım) korur. */
export async function upsertFood(food: FoodItem): Promise<FoodItem> {
  const existing = await db.foods.get(food.id);
  const merged: FoodItem = existing
    ? { ...food, isFavorite: existing.isFavorite, lastUsedAt: existing.lastUsedAt, createdAt: existing.createdAt }
    : food;
  await db.foods.put(merged);
  return merged;
}

/** API sonuçlarını toplu önbelleğe alır, mevcut kayıtların üzerine yazmaz. */
export async function cacheFoods(foods: readonly FoodItem[]): Promise<void> {
  if (foods.length === 0) return;
  const existingIds = new Set(
    (await db.foods.bulkGet(foods.map((f) => f.id))).flatMap((f) => (f ? [f.id] : [])),
  );
  await db.foods.bulkPut(foods.filter((f) => !existingIds.has(f.id)));
}

export async function searchLocalFoods(query: string, limit = 20): Promise<FoodItem[]> {
  const q = normalizeText(query);
  if (!q) return [];
  const terms = q.split(' ');
  const results = await db.foods
    .filter((f) => {
      const hay = `${f.searchName} ${f.brand ? normalizeText(f.brand) : ''} ${f.barcode ?? ''}`;
      return terms.every((t) => hay.includes(t));
    })
    .toArray();
  return results
    .sort((a, b) => b.isFavorite - a.isFavorite || b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit);
}

export async function findFoodByBarcode(barcode: string): Promise<FoodItem | undefined> {
  return db.foods.where('barcode').equals(barcode).first();
}

export async function toggleFavorite(id: string): Promise<void> {
  const food = await db.foods.get(id);
  if (food) await db.foods.update(id, { isFavorite: food.isFavorite === 1 ? 0 : 1 });
}

export async function markFoodUsed(id: string): Promise<void> {
  await db.foods.update(id, { lastUsedAt: Date.now() });
}
