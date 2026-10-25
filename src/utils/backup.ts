import { db } from '../db/localDb';
import type { FoodItem, MealLog, Nutrients, UserProfile, WeightEntry } from '../types/nutrition';
import type { PersistedData } from '../store/useNutritionStore';
import { DEFAULT_PROFILE } from '../store/useNutritionStore';
import { isValidDateKey, todayKey } from './date';

// ─────────────────────────────────────────────────────────────
// JSON yedekleme (dışa / içe aktarma)
// ─────────────────────────────────────────────────────────────

const BACKUP_FORMAT = 'makro-takip-backup';
const BACKUP_VERSION = 1;

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: PersistedData;
  /** Özel, favori veya kullanılmış besinler (saf API önbelleği hariç). */
  foods: FoodItem[];
}

export async function exportBackup(data: PersistedData): Promise<void> {
  const foods = await db.foods
    .filter((f) => f.source === 'custom' || f.isFavorite === 1 || f.lastUsedAt > 0)
    .toArray();
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    foods,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `makro-takip-yedek-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tip korumaları (type guards) ─────────────────────────────

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'salt'] as const;

function isNutrients(v: unknown): v is Nutrients {
  return isRec(v) && NUTRIENT_KEYS.every((k) => isNum(v[k]));
}

function isMealLog(v: unknown): v is MealLog {
  return (
    isRec(v) &&
    isStr(v.id) &&
    isStr(v.date) &&
    isStr(v.foodId) &&
    isStr(v.foodName) &&
    isNum(v.grams) &&
    ['breakfast', 'lunch', 'dinner', 'snack'].includes(String(v.category)) &&
    isNutrients(v.per100g) &&
    isNutrients(v.nutrients)
  );
}

function isFoodItem(v: unknown): v is FoodItem {
  return isRec(v) && isStr(v.id) && isStr(v.name) && isNutrients(v.per100g) && Array.isArray(v.servings);
}

function isWeightEntry(v: unknown): v is WeightEntry {
  return isRec(v) && isStr(v.date) && isValidDateKey(v.date) && isNum(v.weightKg);
}

export class BackupError extends Error {}

export async function parseAndImportBackup(text: string): Promise<PersistedData> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('Dosya geçerli bir JSON değil.');
  }
  if (!isRec(raw) || raw.format !== BACKUP_FORMAT || !isRec(raw.data)) {
    throw new BackupError('Bu dosya bir Makro Takip yedeği değil.');
  }
  const d = raw.data;

  const logsByDate: Record<string, MealLog[]> = {};
  if (isRec(d.logsByDate)) {
    for (const [date, logs] of Object.entries(d.logsByDate)) {
      if (!isValidDateKey(date) || !Array.isArray(logs)) continue;
      const valid = logs.filter(isMealLog);
      if (valid.length) logsByDate[date] = valid;
    }
  }

  const waterByDate: Record<string, number> = {};
  if (isRec(d.waterByDate)) {
    for (const [date, ml] of Object.entries(d.waterByDate)) {
      if (isValidDateKey(date) && isNum(ml)) waterByDate[date] = ml;
    }
  }

  const profile: UserProfile = isRec(d.profile)
    ? { ...DEFAULT_PROFILE, ...(d.profile as Partial<UserProfile>) }
    : DEFAULT_PROFILE;

  const result: PersistedData = {
    profile,
    onboarded: true,
    logsByDate,
    waterByDate,
    weightLog: Array.isArray(d.weightLog) ? d.weightLog.filter(isWeightEntry) : [],
  };

  if (Array.isArray(raw.foods)) {
    await db.foods.bulkPut(raw.foods.filter(isFoodItem));
  }
  return result;
}
