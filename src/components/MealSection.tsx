import { useMemo, useState } from 'react';
import { Check, Coffee, Copy, Moon, Pencil, Plus, Sun, Trash2, X, Zap } from 'lucide-react';
import type { MealCategory, MealLog } from '../types/nutrition';
import { MEAL_CATEGORY_LABELS } from '../types/nutrition';
import { useNutritionStore } from '../store/useNutritionStore';
import { formatAmount, sumNutrients } from '../utils/metabolism';
import { addDays } from '../utils/date';
import { toNumber } from '../utils/common';

interface MealSectionProps {
  category: MealCategory;
  date: string;
  logs: MealLog[];
  onAdd: (category: MealCategory) => void;
}

const ICONS: Readonly<Record<MealCategory, typeof Sun>> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Zap,
};

function LogRow({ log }: { log: MealLog }) {
  const updateLog = useNutritionStore((s) => s.updateLog);
  const removeLog = useNutritionStore((s) => s.removeLog);
  const [editing, setEditing] = useState(false);
  const [gramsText, setGramsText] = useState(String(log.grams));
  const n = log.nutrients;

  const save = () => {
    const g = toNumber(gramsText);
    if (g > 0) updateLog(log.date, log.id, { grams: g });
    setEditing(false);
  };

  return (
    <li className="group flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-100">{log.foodName}</p>
        <p className="truncate text-[11px] text-slate-500">
          {log.brand && `${log.brand} · `}P {formatAmount(n.protein)} · K {formatAmount(n.carbs)} · Y {formatAmount(n.fat)}
        </p>
      </div>

      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            inputMode="decimal"
            value={gramsText}
            onChange={(e) => setGramsText(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="input w-20 py-1 text-right"
          />
          <span className="text-xs text-slate-500">g</span>
          <button type="submit" className="btn-icon size-8 text-emerald-400" aria-label="Kaydet">
            <Check className="size-4" />
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-icon size-8" aria-label="Vazgeç">
            <X className="size-4" />
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => {
              setGramsText(String(log.grams));
              setEditing(true);
            }}
            className="text-right"
            title="Gramajı düzenle"
          >
            <p className="text-sm font-semibold tabular-nums text-slate-200">{formatAmount(n.kcal, 0)} kcal</p>
            <p className="flex items-center justify-end gap-1 text-[11px] text-slate-500">
              {formatAmount(log.grams)} g <Pencil className="size-3" />
            </p>
          </button>
          <button
            onClick={() => removeLog(log.date, log.id)}
            className="btn-icon size-8 opacity-60 group-hover:opacity-100 hover:text-rose-400"
            aria-label={`${log.foodName} sil`}
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
    </li>
  );
}

export function MealSection({ category, date, logs, onAdd }: MealSectionProps) {
  const copyMeals = useNutritionStore((s) => s.copyMeals);
  const yesterday = addDays(date, -1);
  const yesterdayCount = useNutritionStore(
    (s) => (s.logsByDate[yesterday] ?? []).filter((l) => l.category === category).length,
  );
  const total = useMemo(() => sumNutrients(logs.map((l) => l.nutrients)), [logs]);
  const Icon = ICONS[category];

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
            <Icon className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{MEAL_CATEGORY_LABELS[category]}</h3>
            <p className="text-[11px] text-slate-500">
              {logs.length > 0
                ? `${formatAmount(total.kcal, 0)} kcal · P ${formatAmount(total.protein, 0)} · K ${formatAmount(total.carbs, 0)} · Y ${formatAmount(total.fat, 0)}`
                : 'Henüz kayıt yok'}
            </p>
          </div>
        </div>
        <button onClick={() => onAdd(category)} className="btn-icon bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25" aria-label="Besin ekle">
          <Plus className="size-5" />
        </button>
      </div>

      {logs.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-800 border-t border-slate-800">
          {logs.map((l) => (
            <LogRow key={l.id} log={l} />
          ))}
        </ul>
      )}

      {logs.length === 0 && yesterdayCount > 0 && (
        <button onClick={() => copyMeals(yesterday, date, category)} className="btn-ghost mt-2 w-full py-1.5 text-xs text-slate-400">
          <Copy className="size-3.5" /> Önceki günden kopyala ({yesterdayCount} besin)
        </button>
      )}
    </section>
  );
}
