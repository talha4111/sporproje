import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertCircle,
  Award,
  Bot,
  Check,
  CheckCircle2,
  ChefHat,
  Loader2,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type {
  Goal,
  MacroTargets,
  MealCategory,
  Nutrients,
  SmartMealSuggestion,
} from '../types/nutrition';
import { MEAL_CATEGORIES, MEAL_CATEGORY_LABELS } from '../types/nutrition';
import { db, markFoodUsed } from '../db/localDb';
import { buildDailyDebrief, generateCustomMealWithAi, solveMacroGap } from '../services/aiCoach';
import { useNutritionStore } from '../store/useNutritionStore';
import { formatAmount } from '../utils/metabolism';
import { cn } from '../utils/common';

interface SmartCoachPanelProps {
  date: string;
  targets: MacroTargets;
  consumed: Nutrients;
  goal: Goal;
  waterTargetMl: number;
  mealCount: number;
  defaultCategory: MealCategory;
}

export function SmartCoachPanel({
  date,
  targets,
  consumed,
  goal,
  waterTargetMl,
  mealCount,
  defaultCategory,
}: SmartCoachPanelProps) {
  const [activeTab, setActiveTab] = useState<'solver' | 'coach'>('solver');
  const [targetCategory, setTargetCategory] = useState<MealCategory>(defaultCategory);
  const [addedId, setAddedId] = useState<string | null>(null);

  // Özel malzeme ile AI kombinasyon durumu
  const [fridgeText, setFridgeText] = useState('');
  const [aiMeal, setAiMeal] = useState<SmartMealSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const addLog = useNutritionStore((s) => s.addLog);
  const waterMl = useNutritionStore((s) => s.waterByDate[date] ?? 0);

  const localFoods = useLiveQuery(() => db.foods.toArray(), [], []);

  const remaining = useMemo(
    () => ({
      kcal: Math.max(0, Math.round(targets.kcal - consumed.kcal)),
      protein: Math.max(0, Math.round(targets.protein - consumed.protein)),
      carbs: Math.max(0, Math.round(targets.carbs - consumed.carbs)),
      fat: Math.max(0, Math.round(targets.fat - consumed.fat)),
    }),
    [targets, consumed],
  );

  const suggestions = useMemo(
    () => solveMacroGap(targets, consumed, localFoods),
    [targets, consumed, localFoods],
  );

  const debrief = useMemo(
    () => buildDailyDebrief(targets, consumed, waterMl, waterTargetMl, goal, mealCount),
    [targets, consumed, waterMl, waterTargetMl, goal, mealCount],
  );

  const handleApplySuggestion = async (suggestion: SmartMealSuggestion) => {
    for (const item of suggestion.items) {
      addLog(item.food, item.grams, targetCategory, date);
      await markFoodUsed(item.food.id);
    }
    setAddedId(suggestion.id);
    window.setTimeout(() => setAddedId(null), 2000);
  };

  const handleGenerateCustomMeal = async () => {
    if (!fridgeText.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await generateCustomMealWithAi(remaining, fridgeText);
      setAiMeal(res);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Özel öğün oluşturulamadı.');
    } finally {
      setAiLoading(false);
    }
  };

  const allSuggestions = aiMeal ? [aiMeal, ...suggestions] : suggestions;

  return (
    <section className="card space-y-4 border-emerald-500/25 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20">
      {/* Üst Başlık ve Sekme Seçici */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            {activeTab === 'solver' ? <Target className="size-5" /> : <Bot className="size-5" />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              {activeTab === 'solver' ? 'Kalan Makroya Göre Akıllı Öğün Önerisi' : 'Kişisel AI Beslenme Koçu & Karne'}
            </h2>
            <p className="text-[11px] text-slate-400">
              {activeTab === 'solver'
                ? 'Açığını gramı gramına kapatan hazır kombinasyonlar'
                : 'Günlük makro, lif, şeker ve su performans analizin'}
            </p>
          </div>
        </div>

        <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('solver')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors',
              activeTab === 'solver' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <ChefHat className="size-3.5" /> Öğün Önerici
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('coach')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors',
              activeTab === 'coach' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Bot className="size-3.5" /> AI Koç ({debrief.score}/100)
          </button>
        </div>
      </div>

      {activeTab === 'solver' ? (
        <div className="space-y-3">
          {/* Kalan Makro Özeti & Hedef Öğün Seçimi */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/70 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">Kalan Açık:</span>
              <span className="font-semibold text-emerald-400">{remaining.kcal} kcal</span>
              <span className="text-slate-600">·</span>
              <span className="font-semibold text-sky-400">P: {remaining.protein}g</span>
              <span className="font-semibold text-amber-400">K: {remaining.carbs}g</span>
              <span className="font-semibold text-violet-400">Y: {remaining.fat}g</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Eklenecek Öğün:</span>
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value as MealCategory)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
              >
                {MEAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {MEAL_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dolaptaki Malzemelerle Özel AI Tarif Kutusu */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5 sm:flex-row">
            <input
              type="text"
              value={fridgeText}
              onChange={(e) => setFridgeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleGenerateCustomMeal();
              }}
              placeholder="Dolapta ne var? (örn: 3 yumurta, lor peyniri, yulaf, ton balığı...)"
              className="input flex-1 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleGenerateCustomMeal()}
              disabled={aiLoading || !fridgeText.trim()}
              className="btn-secondary shrink-0 px-3 py-1.5 text-xs text-amber-300"
            >
              {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Malzememle Kombinle
            </button>
          </div>

          {aiError && <p className="text-xs text-rose-400">{aiError}</p>}

          {/* Öneri Kartları */}
          <div className="grid gap-3 md:grid-cols-3">
            {allSuggestions.map((s) => {
              const isAdded = addedId === s.id;
              return (
                <div
                  key={s.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3 transition-colors hover:border-slate-700"
                >
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-xs font-bold text-slate-100">{s.title}</h3>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{s.rationale}</p>
                    </div>

                    <ul className="space-y-1 border-y border-slate-800/80 py-2 text-xs">
                      {s.items.map((item, idx) => (
                        <li key={`${item.food.id}-${idx}`} className="flex items-center justify-between gap-2">
                          <span className="truncate text-slate-200">{item.food.name}</span>
                          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300 tabular-nums">
                            {item.grams} g
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-medium tabular-nums">
                      <span className="text-emerald-400">{formatAmount(s.total.kcal, 0)} kcal</span>
                      <span className="text-sky-400">P {formatAmount(s.total.protein, 0)}g</span>
                      <span className="text-amber-400">K {formatAmount(s.total.carbs, 0)}g</span>
                      <span className="text-violet-400">Y {formatAmount(s.total.fat, 0)}g</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleApplySuggestion(s)}
                      className={cn(
                        'flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all',
                        isAdded
                          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                          : 'bg-emerald-600/90 text-white hover:bg-emerald-500',
                      )}
                    >
                      {isAdded ? (
                        <>
                          <Check className="size-3.5" /> {MEAL_CATEGORY_LABELS[targetCategory]} Öğününe Eklendi!
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" /> Tek Tıkla Öğüne Ekle
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Sekme 2: Kişisel AI Beslenme Koçu Karnesi (Özellik 6) */
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl border font-bold tabular-nums',
                  debrief.score >= 80
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : debrief.score >= 55
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                      : 'border-rose-500/40 bg-rose-500/15 text-rose-300',
                )}
              >
                <span className="text-lg leading-none">{debrief.score}</span>
                <span className="text-[9px] font-normal opacity-80">/ 100</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <Award className="size-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-100">{debrief.badge}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-300">{debrief.summary}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="size-4" /> Güçlü Noktalar
              </p>
              <ul className="space-y-1 text-xs text-slate-300">
                {debrief.strengths.map((st) => (
                  <li key={st} className="flex items-start gap-1.5">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{st}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5 rounded-xl border border-amber-500/20 bg-amber-950/15 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertCircle className="size-4" /> Gelişim & Dikkat Alanları
              </p>
              <ul className="space-y-1 text-xs text-slate-300">
                {debrief.improvements.map((imp) => (
                  <li key={imp} className="flex items-start gap-1.5">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-950/20 p-3 text-xs text-sky-200">
            <TrendingUp className="mt-0.5 size-4 shrink-0 text-sky-400" />
            <div>
              <span className="font-semibold text-sky-300">Koçun Sıradaki Hamle Tavsiyesi: </span>
              <span>{debrief.nextActionTip}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
