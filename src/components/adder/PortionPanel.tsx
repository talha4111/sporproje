import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, CheckCircle2, Minus, Plus, ShieldCheck, Sparkles, Star } from 'lucide-react';
import type { FoodItem, MealCategory } from '../../types/nutrition';
import { MEAL_CATEGORIES } from '../../types/nutrition';
import { db, toggleFavorite } from '../../db/localDb';
import { computeHealthRadar } from '../../services/foodApi';
import { formatAmount, scaleNutrients } from '../../utils/metabolism';
import { cn, toNumber } from '../../utils/common';
import { Segmented } from '../ui';

interface PortionPanelProps {
  food: FoodItem;
  initialCategory: MealCategory;
  canFavorite: boolean;
  onBack: () => void;
  onAdd: (grams: number, category: MealCategory) => void;
}

const SHORT_LABELS: Readonly<Record<MealCategory, string>> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara Öğün',
};

const CATEGORY_OPTIONS = MEAL_CATEGORIES.map((c) => ({ value: c, label: SHORT_LABELS[c] }));

export function PortionPanel({ food, initialCategory, canFavorite, onBack, onAdd }: PortionPanelProps) {
  const defaultGrams = food.servings[0]?.grams ?? 100;
  const [gramsText, setGramsText] = useState(String(defaultGrams));
  const [category, setCategory] = useState<MealCategory>(initialCategory);
  const live = useLiveQuery(() => db.foods.get(food.id), [food.id]);
  const isFavorite = (live ?? food).isFavorite === 1;

  const grams = Math.max(0, toNumber(gramsText));
  const preview = useMemo(() => scaleNutrients(food.per100g, grams), [food.per100g, grams]);
  const radar = useMemo(
    () => food.healthRadar ?? computeHealthRadar(food.per100g, food.name),
    [food.healthRadar, food.per100g, food.name],
  );
  const presets = [...food.servings, { label: '100 g', grams: 100 }];

  const step = (delta: number) => setGramsText(String(Math.max(0, Math.round(grams + delta))));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <button onClick={onBack} className="btn-icon shrink-0" aria-label="Geri">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-100">{food.name}</h3>
          <p className="text-xs text-slate-500">
            {food.brand && `${food.brand} · `}100 g: {food.per100g.kcal} kcal
          </p>
        </div>
        {canFavorite && (
          <button onClick={() => void toggleFavorite(food.id)} className="btn-icon shrink-0" aria-label="Favori">
            <Star className={cn('size-5', isFavorite && 'fill-amber-400 text-amber-400')} />
          </button>
        )}
      </div>

      {/* Gramaj */}
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Miktar (gram)</p>
        <div className="flex items-center gap-2">
          <button onClick={() => step(-10)} className="btn-secondary px-3" aria-label="10 g azalt">
            <Minus className="size-4" />
          </button>
          <div className="relative flex-1">
            <input
              inputMode="decimal"
              autoFocus
              value={gramsText}
              onChange={(e) => setGramsText(e.target.value.replace(/[^\d.,]/g, ''))}
              onFocus={(e) => e.target.select()}
              className="input py-2.5 pr-8 text-center text-lg font-semibold tabular-nums"
            />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-500">g</span>
          </div>
          <button onClick={() => step(10)} className="btn-secondary px-3" aria-label="10 g artır">
            <Plus className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((s) => (
            <button
              key={`${s.label}-${s.grams}`}
              onClick={() => setGramsText(String(s.grams))}
              className={cn('chip', grams === s.grams && 'border-emerald-600 text-emerald-300')}
            >
              {s.label} {s.label !== '100 g' && <span className="text-slate-500">· {s.grams} g</span>}
            </button>
          ))}
          {food.servings[0] && (
            <button onClick={() => setGramsText(String(food.servings[0].grams * 2))} className="chip">
              2× {food.servings[0].label}
            </button>
          )}
        </div>
      </div>

      {/* Canlı önizleme */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Kalori', value: formatAmount(preview.kcal, 0), unit: 'kcal', cls: 'text-emerald-400' },
          { label: 'Protein', value: formatAmount(preview.protein), unit: 'g', cls: 'text-sky-400' },
          { label: 'Karb.', value: formatAmount(preview.carbs), unit: 'g', cls: 'text-amber-400' },
          { label: 'Yağ', value: formatAmount(preview.fat), unit: 'g', cls: 'text-violet-400' },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-950 px-1 py-2.5">
            <p className={cn('text-lg font-bold tabular-nums transition-all', m.cls)}>{m.value}</p>
            <p className="text-[10px] text-slate-500">
              {m.label} ({m.unit})
            </p>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-center text-[11px] text-slate-500">
        Lif {formatAmount(preview.fiber)} g · Şeker {formatAmount(preview.sugar)} g · Tuz {formatAmount(preview.salt, 2)} g
      </p>

      {/* Temiz Beslenme & Katkı Maddesi Radarı (Özellik 4) */}
      {(radar.novaGroup || radar.nutriScore || radar.warnings.length > 0 || radar.positives.length > 0) && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <ShieldCheck className="size-4 text-emerald-400" /> Temiz Beslenme & Katkı Radarı
            </span>
            <div className="flex items-center gap-1.5">
              {radar.novaGroup && (
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold',
                    radar.novaGroup === 1 && 'bg-emerald-500/20 text-emerald-300',
                    radar.novaGroup === 2 && 'bg-sky-500/20 text-sky-300',
                    radar.novaGroup === 3 && 'bg-amber-500/20 text-amber-300',
                    radar.novaGroup === 4 && 'bg-rose-500/20 text-rose-300',
                  )}
                >
                  NOVA {radar.novaGroup}
                </span>
              )}
              {radar.nutriScore && (
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold',
                    (radar.nutriScore === 'A' || radar.nutriScore === 'B') && 'bg-emerald-500/20 text-emerald-300',
                    radar.nutriScore === 'C' && 'bg-amber-500/20 text-amber-300',
                    (radar.nutriScore === 'D' || radar.nutriScore === 'E') && 'bg-rose-500/20 text-rose-300',
                  )}
                >
                  Nutri-Score {radar.nutriScore}
                </span>
              )}
            </div>
          </div>

          {radar.warnings.length > 0 && (
            <ul className="space-y-1">
              {radar.warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-[11px] text-rose-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rose-400" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}

          {radar.positives.length > 0 && (
            <ul className="space-y-1">
              {radar.positives.map((p) => (
                <li key={p} className="flex items-start gap-1.5 text-[11px] text-emerald-300">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}

          {radar.cleanerAlternative && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-950/30 p-2 text-[11px] text-amber-200">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
              <span>{radar.cleanerAlternative}</span>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Öğün</p>
        <Segmented value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
      </div>

      <button onClick={() => onAdd(grams, category)} disabled={grams <= 0} className="btn-primary w-full py-2.5">
        <Plus className="size-4" /> {formatAmount(grams, 1)} g ekle · {formatAmount(preview.kcal, 0)} kcal
      </button>
    </div>
  );
}
