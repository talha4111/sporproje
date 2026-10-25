import { Droplets, Minus, Plus } from 'lucide-react';
import { useNutritionStore } from '../store/useNutritionStore';
import { formatAmount } from '../utils/metabolism';
import { ProgressBar } from './ui';

const QUICK_AMOUNTS = [200, 330, 500] as const;

export function WaterTracker({ date }: { date: string }) {
  const water = useNutritionStore((s) => s.waterByDate[date] ?? 0);
  const target = useNutritionStore((s) => s.profile.waterTargetMl);
  const addWater = useNutritionStore((s) => s.addWater);
  const done = water >= target;

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Droplets className="size-4 text-cyan-400" /> Su
        </h3>
        <span className="text-sm tabular-nums text-slate-300">
          {formatAmount(water / 1000, 2)} <span className="text-slate-500">/ {formatAmount(target / 1000, 1)} L</span>
        </span>
      </div>
      {/* Su hedefini aşmak olumsuz değil → kırmızıya dönmesin */}
      <ProgressBar value={Math.min(water, target)} max={target} colorClass={done ? 'bg-emerald-500' : 'bg-cyan-500'} />
      <div className="mt-3 flex items-center gap-1.5">
        <button onClick={() => addWater(date, -250)} disabled={water === 0} className="btn-secondary px-2.5 py-1.5" aria-label="250 ml azalt">
          <Minus className="size-4" />
        </button>
        {QUICK_AMOUNTS.map((ml) => (
          <button key={ml} onClick={() => addWater(date, ml)} className="btn-secondary flex-1 px-2 py-1.5 text-xs">
            <Plus className="size-3.5" /> {ml} ml
          </button>
        ))}
      </div>
    </section>
  );
}
