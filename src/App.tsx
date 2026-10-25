import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Copy, Plus, Sparkles } from 'lucide-react';
import type { MealCategory } from './types/nutrition';
import { MEAL_CATEGORIES } from './types/nutrition';
import { selectLogsForDate, useNutritionStore } from './store/useNutritionStore';
import { calculateTargets, sumNutrients } from './utils/metabolism';
import { addDays, todayKey } from './utils/date';
import { Header } from './components/Header';
import { MacroDashboard } from './components/MacroDashboard';
import { SmartCoachPanel } from './components/SmartCoachPanel';
import { MealSection } from './components/MealSection';
import { FoodAdderModal, type AdderTab } from './components/FoodAdderModal';
import { ProfileModal } from './components/ProfileModal';
import { MobileConnectModal } from './components/MobileConnectModal';
import { WaterTracker } from './components/WaterTracker';
import { WeeklyChart } from './components/WeeklyChart';
import { WeightTracker } from './components/WeightTracker';

/** Uygulama gece yarısını geçerek açık kaldıysa "Bugün"ü otomatik ilerlet. */
function useDayRollover() {
  const lastToday = useRef(todayKey());
  useEffect(() => {
    const check = () => {
      const now = todayKey();
      if (now === lastToday.current) return;
      const { selectedDate, setSelectedDate } = useNutritionStore.getState();
      if (selectedDate === lastToday.current) setSelectedDate(now);
      lastToday.current = now;
    };
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
}

export default function App() {
  useDayRollover();
  const profile = useNutritionStore((s) => s.profile);
  const onboarded = useNutritionStore((s) => s.onboarded);
  const selectedDate = useNutritionStore((s) => s.selectedDate);
  const logs = useNutritionStore(selectLogsForDate(selectedDate));
  const copyMeals = useNutritionStore((s) => s.copyMeals);
  const prevDayCount = useNutritionStore((s) => s.logsByDate[addDays(selectedDate, -1)]?.length ?? 0);

  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adder, setAdder] = useState<{ open: boolean; category: MealCategory; tab: AdderTab }>({
    open: false,
    category: 'breakfast',
    tab: 'saved',
  });

  const targets = useMemo(() => calculateTargets(profile), [profile]);
  const consumed = useMemo(() => sumNutrients(logs.map((l) => l.nutrients)), [logs]);
  const byCategory = useMemo(() => {
    const map: Record<MealCategory, typeof logs> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const l of logs) map[l.category].push(l);
    return map;
  }, [logs]);

  const openAdder = (category: MealCategory, tab: AdderTab = 'saved') =>
    setAdder({ open: true, category, tab });

  return (
    <div className="min-h-dvh bg-slate-950 pb-24">
      <Header onOpenProfile={() => setProfileOpen(true)} onOpenMobile={() => setMobileOpen(true)} />

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <MacroDashboard targets={targets} consumed={consumed} />

          {/* Hızlı AI Kamera Tabak Tarama Kartı */}
          <button
            type="button"
            onClick={() => openAdder(guessCategory(), 'vision')}
            className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-slate-900 p-4 text-left transition-all hover:border-amber-400/60 hover:from-amber-500/15"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40">
                <Camera className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-100">Yemeği Kamerayla Okut</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    <Sparkles className="size-3" /> AI Vision
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Tabağının fotoğrafını çek; yemekleri, gramajları ve tüm makroları otomatik çıkarsın
                </p>
              </div>
            </div>
            <span className="hidden shrink-0 rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors group-hover:bg-amber-500/30 sm:inline-block">
              Tabağı Tara →
            </span>
          </button>

          {/* Özellik 3 & 6: Kalan Makroya Göre Akıllı Öğün Önerisi ve Kişisel AI Beslenme Koçu */}
          <SmartCoachPanel
            date={selectedDate}
            targets={targets}
            consumed={consumed}
            goal={profile.goal}
            waterTargetMl={profile.waterTargetMl}
            mealCount={logs.length}
            defaultCategory={guessCategory()}
          />

          {logs.length === 0 && prevDayCount > 0 && (
            <button onClick={() => copyMeals(addDays(selectedDate, -1), selectedDate)} className="btn-secondary w-full text-xs">
              <Copy className="size-4" /> Önceki günün tüm öğünlerini kopyala ({prevDayCount} besin)
            </button>
          )}

          {MEAL_CATEGORIES.map((c) => (
            <MealSection key={c} category={c} date={selectedDate} logs={byCategory[c]} onAdd={(cat) => openAdder(cat, 'saved')} />
          ))}
        </div>

        <aside className="space-y-4">
          <WaterTracker date={selectedDate} />
          <WeeklyChart endDate={selectedDate} targetKcal={targets.kcal} />
          <WeightTracker date={selectedDate} />
        </aside>
      </main>

      {/* Yüzen hızlı işlem düğmeleri (Mobil & Masaüstü) */}
      <div className="fixed right-5 bottom-5 z-30 flex flex-col items-end gap-2.5">
        <button
          onClick={() => openAdder(guessCategory(), 'vision')}
          className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-amber-300 shadow-lg backdrop-blur transition-transform hover:scale-105 active:scale-95"
          aria-label="Kamerayla yemek okut"
        >
          <Camera className="size-4" /> Tabağı Okut
        </button>
        <button
          onClick={() => openAdder(guessCategory(), 'saved')}
          className="flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 transition-transform hover:scale-105 hover:bg-emerald-500 active:scale-95"
          aria-label="Besin ekle"
        >
          <Plus className="size-7" />
        </button>
      </div>

      <FoodAdderModal
        open={adder.open}
        onClose={() => setAdder((a) => ({ ...a, open: false }))}
        date={selectedDate}
        initialCategory={adder.category}
        initialTab={adder.tab}
      />
      <MobileConnectModal open={mobileOpen} onClose={() => setMobileOpen(false)} />
      {(profileOpen || !onboarded) && (
        <ProfileModal open onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}

/** Saate göre varsayılan öğün kategorisi. */
function guessCategory(): MealCategory {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 22) return 'dinner';
  return 'snack';
}
