import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  FoodItem,
  MealCategory,
  MealLog,
  UserProfile,
  WeightEntry,
} from '../types/nutrition';
import { scaleNutrients } from '../utils/metabolism';
import { createId } from '../utils/common';
import { todayKey } from '../utils/date';

// ─────────────────────────────────────────────────────────────
// Zustand store — profil, tarih bazlı öğün kayıtları, su ve kilo.
// `localStorage` üzerinde kalıcı (persist).
// ─────────────────────────────────────────────────────────────

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  sex: 'male',
  age: 25,
  heightCm: 178,
  weightKg: 78,
  activityLevel: 'moderate',
  goal: 'maintain',
  macroMode: 'bodyweight',
  percentages: { protein: 30, carbs: 45, fat: 25 },
  proteinPerKg: 2,
  waterTargetMl: 3000,
};

export interface PersistedData {
  profile: UserProfile;
  onboarded: boolean;
  logsByDate: Record<string, MealLog[]>;
  waterByDate: Record<string, number>;
  weightLog: WeightEntry[];
}

interface NutritionState extends PersistedData {
  selectedDate: string;

  setSelectedDate: (date: string) => void;
  setProfile: (profile: UserProfile) => void;

  addLog: (food: FoodItem, grams: number, category: MealCategory, date?: string) => MealLog;
  updateLog: (date: string, id: string, patch: { grams?: number; category?: MealCategory }) => void;
  removeLog: (date: string, id: string) => void;
  /** Bir günün (veya tek bir öğünün) kayıtlarını başka bir güne kopyalar. Kopyalanan kayıt sayısını döner. */
  copyMeals: (fromDate: string, toDate: string, category?: MealCategory) => number;

  addWater: (date: string, deltaMl: number) => void;
  logWeight: (date: string, weightKg: number) => void;
  removeWeight: (date: string) => void;

  importData: (data: PersistedData) => void;
  resetAll: () => void;
}

const initialData: PersistedData = {
  profile: DEFAULT_PROFILE,
  onboarded: false,
  logsByDate: {},
  waterByDate: {},
  weightLog: [],
};

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set, get) => ({
      ...initialData,
      selectedDate: todayKey(),

      setSelectedDate: (date) => set({ selectedDate: date }),

      setProfile: (profile) => set({ profile, onboarded: true }),

      addLog: (food, grams, category, date = get().selectedDate) => {
        const log: MealLog = {
          id: createId('log'),
          date,
          category,
          foodId: food.id,
          foodName: food.name,
          brand: food.brand,
          grams,
          per100g: { ...food.per100g },
          nutrients: scaleNutrients(food.per100g, grams),
          createdAt: Date.now(),
        };
        set((s) => ({
          logsByDate: { ...s.logsByDate, [date]: [...(s.logsByDate[date] ?? []), log] },
        }));
        return log;
      },

      updateLog: (date, id, patch) =>
        set((s) => ({
          logsByDate: {
            ...s.logsByDate,
            [date]: (s.logsByDate[date] ?? []).map((l) => {
              if (l.id !== id) return l;
              const grams = patch.grams ?? l.grams;
              return {
                ...l,
                grams,
                category: patch.category ?? l.category,
                nutrients: scaleNutrients(l.per100g, grams),
              };
            }),
          },
        })),

      removeLog: (date, id) =>
        set((s) => {
          const remaining = (s.logsByDate[date] ?? []).filter((l) => l.id !== id);
          const logsByDate = { ...s.logsByDate };
          if (remaining.length) logsByDate[date] = remaining;
          else delete logsByDate[date];
          return { logsByDate };
        }),

      copyMeals: (fromDate, toDate, category) => {
        const source = (get().logsByDate[fromDate] ?? []).filter((l) => !category || l.category === category);
        if (source.length === 0) return 0;
        const now = Date.now();
        const copies = source.map<MealLog>((l, i) => ({
          ...l,
          id: createId('log'),
          date: toDate,
          createdAt: now + i,
        }));
        set((s) => ({
          logsByDate: { ...s.logsByDate, [toDate]: [...(s.logsByDate[toDate] ?? []), ...copies] },
        }));
        return copies.length;
      },

      addWater: (date, deltaMl) =>
        set((s) => ({
          waterByDate: { ...s.waterByDate, [date]: Math.max(0, (s.waterByDate[date] ?? 0) + deltaMl) },
        })),

      logWeight: (date, weightKg) =>
        set((s) => {
          const weightLog = [...s.weightLog.filter((w) => w.date !== date), { date, weightKg }].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          // En güncel tartı profil kilosunu da günceller → hedefler otomatik yeniden hesaplanır.
          const latest = weightLog[weightLog.length - 1];
          const profile = latest && latest.date === date ? { ...s.profile, weightKg } : s.profile;
          return { weightLog, profile };
        }),

      removeWeight: (date) => set((s) => ({ weightLog: s.weightLog.filter((w) => w.date !== date) })),

      importData: (data) => set({ ...data, onboarded: true }),

      resetAll: () => set({ ...initialData, selectedDate: todayKey() }),
    }),
    {
      name: 'makro-takip-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Seçili tarih kalıcı değil: uygulama her açılışta "Bugün" ile başlar.
      partialize: (s): PersistedData => ({
        profile: s.profile,
        onboarded: s.onboarded,
        logsByDate: s.logsByDate,
        waterByDate: s.waterByDate,
        weightLog: s.weightLog,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedData>;
        return {
          ...current,
          ...p,
          // Yeni eklenen profil alanları eski kayıtlarda eksik olabilir.
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
        };
      },
    },
  ),
);

/** Seçili günün kayıtlarını döner (stabil boş dizi referansıyla). */
const EMPTY_LOGS: MealLog[] = [];
export const selectLogsForDate = (date: string) => (s: NutritionState) => s.logsByDate[date] ?? EMPTY_LOGS;
