import { Capacitor } from '@capacitor/core';
import type { FoodItem, HealthRadar, NovaGroup, NutriScoreGrade, Nutrients, ServingPreset } from '../types/nutrition';
import { cacheFoods, findFoodByBarcode, searchLocalFoods, upsertFood } from '../db/localDb';
import { kcalFromMacros } from '../utils/metabolism';
import { normalizeText, toNumber } from '../utils/common';

// ─────────────────────────────────────────────────────────────
// Open Food Facts API servisi
// Arama için Search-a-licious API (modern, hızlı ve Türkçe destekli)
// Barkod için Open Food Facts v2 API
// Vite proxy (`/api/off-...`) üzerinden CORS ve 503 engelleri aşılır.
// ─────────────────────────────────────────────────────────────

const PROXY_PRODUCT_URL = '/api/off-product';
const DIRECT_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

const PROXY_SEARCH_URL = '/api/off-search';
const DIRECT_SEARCH_URL = 'https://search.openfoodfacts.org/search';
const LEGACY_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

const FIELDS = [
  'code',
  'product_name',
  'product_name_tr',
  'product_name_en',
  'generic_name',
  'brands',
  'brands_tags',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'image_front_small_url',
  'image_small_url',
  'image_front_url',
  'image_url',
  'nova_group',
  'nutriscore_grade',
  'additives_tags',
  'ingredients_analysis_tags',
].join(',');

export const MIN_QUERY_LENGTH = 3;
const KJ_PER_KCAL = 4.184;
const SEARCH_LIMIT_PER_MINUTE = 20;

// ─── API yanıt tipleri ────────────────────────────────────────

type NumericLike = number | string | undefined;

interface OffNutriments {
  'energy-kcal_100g'?: NumericLike;
  'energy-kj_100g'?: NumericLike;
  energy_100g?: NumericLike;
  proteins_100g?: NumericLike;
  carbohydrates_100g?: NumericLike;
  fat_100g?: NumericLike;
  fiber_100g?: NumericLike;
  sugars_100g?: NumericLike;
  salt_100g?: NumericLike;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_tr?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string | string[];
  brands_tags?: string[];
  nutriments?: OffNutriments;
  serving_quantity?: NumericLike;
  serving_size?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  image_front_url?: string;
  image_url?: string;
  nova_group?: NumericLike;
  nutriscore_grade?: string;
  additives_tags?: string[];
  ingredients_analysis_tags?: string[];
}

interface OffProductResponse {
  status?: number;
  product?: OffProduct;
}

interface OffSearchResponse {
  count?: number;
  hits?: OffProduct[];
  products?: OffProduct[];
}

// ─── Hata tipleri ─────────────────────────────────────────────

export type FoodApiErrorKind = 'offline' | 'network' | 'rate_limit' | 'not_found' | 'bad_response';

export class FoodApiError extends Error {
  readonly kind: FoodApiErrorKind;
  readonly retryAfterSec?: number;

  constructor(kind: FoodApiErrorKind, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'FoodApiError';
    this.kind = kind;
    this.retryAfterSec = retryAfterSec;
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ─── Veri temizleme (sanitization) ────────────────────────────

const clean = (v: NumericLike): number => Math.max(0, toNumber(v, 0));

export function sanitizeNutriments(raw: OffNutriments | undefined): Nutrients {
  const nm = raw ?? {};
  const protein = clean(nm.proteins_100g);
  const carbs = clean(nm.carbohydrates_100g);
  const fat = clean(nm.fat_100g);

  // Öncelik: kcal → kJ dönüşümü → makrolardan hesaplama
  let kcal = clean(nm['energy-kcal_100g']);
  if (kcal <= 0) {
    const kj = clean(nm['energy-kj_100g']) || clean(nm.energy_100g);
    kcal = kj > 0 ? kj / KJ_PER_KCAL : kcalFromMacros(protein, carbs, fat);
  }

  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    kcal: Math.round(kcal),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    fiber: round(clean(nm.fiber_100g)),
    sugar: round(clean(nm.sugars_100g)),
    salt: round(clean(nm.salt_100g)),
  };
}

export function computeHealthRadar(
  per100g: Nutrients,
  name: string,
  rawMeta?: {
    novaGroup?: NumericLike;
    nutriScore?: string;
    additivesTags?: string[];
    analysisTags?: string[];
  },
): HealthRadar {
  const rawNova = Math.round(toNumber(rawMeta?.novaGroup, 0));
  const novaGroup: NovaGroup | undefined =
    rawNova === 1 || rawNova === 2 || rawNova === 3 || rawNova === 4 ? rawNova : undefined;

  const rawGrade = (rawMeta?.nutriScore ?? '').trim().toUpperCase();
  const nutriScore: NutriScoreGrade | undefined =
    rawGrade === 'A' || rawGrade === 'B' || rawGrade === 'C' || rawGrade === 'D' || rawGrade === 'E'
      ? rawGrade
      : undefined;

  const additivesCount = Array.isArray(rawMeta?.additivesTags) ? rawMeta.additivesTags.length : 0;
  const analysisTags = Array.isArray(rawMeta?.analysisTags) ? rawMeta.analysisTags : [];

  const warnings: string[] = [];
  const positives: string[] = [];

  if (novaGroup === 4) {
    warnings.push('NOVA 4: Ultra-işlenmiş gıda kategorisinde');
  } else if (novaGroup === 1) {
    positives.push('NOVA 1: Doğal / minimal işlenmiş temiz gıda');
  }

  if (analysisTags.some((t) => t.includes('palm-oil') && !t.includes('palm-oil-free'))) {
    warnings.push('Palm yağı içeriyor');
  } else if (analysisTags.some((t) => t.includes('palm-oil-free'))) {
    positives.push('Palm yağı içermez');
  }

  if (additivesCount >= 3) {
    warnings.push(`${additivesCount} adet katkı maddesi (E-kodu) içeriyor`);
  } else if (additivesCount > 0) {
    warnings.push(`${additivesCount} adet katkı maddesi içeriyor`);
  }

  if (per100g.sugar >= 15) {
    warnings.push(`Yüksek şeker oranı (${per100g.sugar}g / 100g)`);
  } else if (per100g.sugar <= 2 && per100g.kcal > 30) {
    positives.push('Düşük şeker');
  }

  if (per100g.salt >= 1.5) {
    warnings.push(`Yüksek tuz/sodyum (${per100g.salt}g / 100g)`);
  }

  if (per100g.protein >= 18) {
    positives.push(`Yüksek protein kaynağı (${per100g.protein}g / 100g)`);
  } else if (per100g.protein >= 10 && per100g.protein * 4 >= per100g.kcal * 0.25) {
    positives.push('İyi protein oranı');
  }

  if (per100g.fiber >= 5) {
    positives.push(`Yüksek lif içeriği (${per100g.fiber}g / 100g)`);
  }

  let cleanerAlternative: string | undefined;
  const norm = normalizeText(name);
  if (novaGroup === 4 || warnings.length >= 2) {
    if (norm.includes('bar') || norm.includes('cikolata') || norm.includes('gofret') || per100g.sugar >= 18) {
      cleanerAlternative = 'Daha temiz alternatif: 150g Süzme Yoğurt + 1 orta boy Muz + 10g Çiğ Badem (Katkısız & yüksek doygunluk)';
    } else if (norm.includes('gevrek') || norm.includes('granola') || norm.includes('misir')) {
      cleanerAlternative = 'Daha temiz alternatif: 60g Sade Yulaf Ezmesi + Tarçın + 1 ölçek Whey veya Süt (Sıfır rafine şeker)';
    } else if (norm.includes('icecek') || norm.includes('gazoz') || norm.includes('meyve suyu')) {
      cleanerAlternative = 'Daha temiz alternatif: Maden suyu + Taze sıkılmış limon veya şekersiz soğuk bitki çayı';
    } else if (norm.includes('cips') || norm.includes('kraker')) {
      cleanerAlternative = 'Daha temiz alternatif: Fırınlanmış baharatlı nohut veya 25g çiğ kuruyemiş';
    } else {
      cleanerAlternative = 'Daha temiz alternatif: Ev yapımı tek bileşenli doğal kaynaklar (yumurta, yulaf, süzme yoğurt veya ızgara et/tavuk)';
    }
  }

  return {
    novaGroup,
    nutriScore,
    additivesCount,
    warnings,
    positives,
    cleanerAlternative,
  };
}

export function normalizeProduct(p: OffProduct): FoodItem | null {
  const name = (p.product_name_tr || p.product_name || p.product_name_en || p.generic_name || '').trim();
  const code = (p.code ?? '').trim();
  if (!name || !code) return null;

  const servings: ServingPreset[] = [];
  const servingGrams = clean(p.serving_quantity);
  if (servingGrams > 0) {
    servings.push({ label: p.serving_size ? `1 porsiyon (${p.serving_size})` : '1 porsiyon', grams: servingGrams });
  }

  let brand: string | undefined;
  if (Array.isArray(p.brands) && p.brands.length > 0) {
    brand = p.brands[0]?.trim();
  } else if (typeof p.brands === 'string' && p.brands.trim()) {
    brand = p.brands.split(',')[0]?.trim();
  }

  const imageUrl = p.image_front_small_url || p.image_small_url || p.image_front_url || p.image_url;
  const per100g = sanitizeNutriments(p.nutriments);
  const healthRadar = computeHealthRadar(per100g, name, {
    novaGroup: p.nova_group,
    nutriScore: p.nutriscore_grade,
    additivesTags: p.additives_tags,
    analysisTags: p.ingredients_analysis_tags,
  });

  return {
    id: `off-${code}`,
    name,
    brand,
    barcode: code,
    imageUrl,
    per100g,
    servings,
    source: 'api',
    isFavorite: 0,
    searchName: normalizeText(name),
    createdAt: Date.now(),
    lastUsedAt: 0,
    healthRadar,
  };
}

// ─── İstek altyapısı ──────────────────────────────────────────

const searchTimestamps: number[] = [];

/** İstemci tarafı kayan pencere limiti */
function reserveSearchSlot(): void {
  const now = Date.now();
  while (searchTimestamps.length && now - searchTimestamps[0] > 60_000) searchTimestamps.shift();
  if (searchTimestamps.length >= SEARCH_LIMIT_PER_MINUTE) {
    const wait = Math.ceil((60_000 - (now - searchTimestamps[0])) / 1000);
    throw new FoodApiError('rate_limit', `Arama limiti doldu. ${wait} sn sonra tekrar deneyin.`, wait);
  }
  searchTimestamps.push(now);
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new FoodApiError('offline', 'İnternet bağlantısı yok. Kayıtlı besinleri kullanabilirsiniz.');
  }
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new FoodApiError('network', 'Open Food Facts sunucusuna ulaşılamadı.');
  }
  if (res.status === 429) {
    throw new FoodApiError('rate_limit', 'Open Food Facts istek limitine ulaşıldı. Lütfen biraz bekleyin.', 60);
  }
  if (res.status === 404) throw new FoodApiError('not_found', 'Ürün bulunamadı.');
  if (!res.ok) throw new FoodApiError('bad_response', `Sunucu yanıt vermedi (${res.status}).`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new FoodApiError('bad_response', 'Sunucudan geçersiz veri alındı.');
  }
}

// ─── Barkod ───────────────────────────────────────────────────

export function isValidBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

/** Önce IndexedDB, bulunamazsa API (proxy öncelikli, doğrudan fallback). */
export async function getProductByBarcode(barcode: string, signal?: AbortSignal): Promise<FoodItem> {
  const code = barcode.trim();
  if (!isValidBarcode(code)) throw new FoodApiError('not_found', 'Geçersiz barkod (8–14 haneli olmalı).');

  const cached = await findFoodByBarcode(code);
  if (cached) return cached;

  const isNative = Capacitor.isNativePlatform();
  const urls = isNative
    ? [`${DIRECT_PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`]
    : [
        `${PROXY_PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
        `${DIRECT_PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
      ];

  let data: OffProductResponse | null = null;
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      data = await fetchJson<OffProductResponse>(url, signal);
      if (data && data.status === 1) break;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }

  const food = data?.status === 1 && data.product ? normalizeProduct({ code, ...data.product }) : null;
  if (!food) {
    if (lastError instanceof FoodApiError && lastError.kind !== 'not_found') {
      throw lastError;
    }
    throw new FoodApiError('not_found', `"${code}" barkodlu ürün Open Food Facts'te bulunamadı. Manuel girişle ekleyebilirsiniz.`);
  }
  return upsertFood(food);
}

// ─── Metin arama ──────────────────────────────────────────────

const remoteCache = new Map<string, FoodItem[]>();

export interface SearchResult {
  local: FoodItem[];
  remote: FoodItem[];
  fromCache: boolean;
}

export async function searchLocal(query: string): Promise<FoodItem[]> {
  return searchLocalFoods(query);
}

/**
 * Open Food Facts metin araması.
 * Proxy (/api/off-search) -> Direct Search-a-licious -> Legacy cgi fallback zincirini izler.
 */
export async function searchRemote(query: string, signal?: AbortSignal): Promise<{ foods: FoodItem[]; fromCache: boolean }> {
  const key = normalizeText(query);
  if (key.length < MIN_QUERY_LENGTH) return { foods: [], fromCache: false };

  const hit = remoteCache.get(key);
  if (hit) return { foods: hit, fromCache: true };

  reserveSearchSlot();

  const q = encodeURIComponent(query.trim());
  const isNative = Capacitor.isNativePlatform();
  const urls = isNative
    ? [
        `${DIRECT_SEARCH_URL}?q=${q}&page_size=15`,
        `${LEGACY_SEARCH_URL}?search_terms=${q}&search_simple=1&action=process&json=1&page_size=10`,
      ]
    : [
        `${PROXY_SEARCH_URL}?q=${q}&page_size=15`,
        `${DIRECT_SEARCH_URL}?q=${q}&page_size=15`,
        `${LEGACY_SEARCH_URL}?search_terms=${q}&search_simple=1&action=process&json=1&page_size=10`,
      ];

  let foods: FoodItem[] = [];
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const data = await fetchJson<OffSearchResponse>(url, signal);
      const items = data.hits ?? data.products ?? [];
      foods = items.flatMap((p) => {
        const f = normalizeProduct(p);
        return f ? [f] : [];
      });
      if (foods.length > 0 || Array.isArray(items)) {
        // Geçerli bir liste yanıtı alındı (sonuç 0 olsa bile başarılı sorgu)
        lastError = null;
        break;
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }

  if (foods.length === 0 && lastError instanceof FoodApiError) {
    throw lastError;
  }

  // Aynı barkodlu tekrarları ayıkla
  const unique = [...new Map(foods.map((f) => [f.id, f])).values()];
  remoteCache.set(key, unique);
  await cacheFoods(unique);
  return { foods: unique, fromCache: false };
}
