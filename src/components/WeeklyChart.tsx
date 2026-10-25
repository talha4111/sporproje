import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useNutritionStore } from '../store/useNutritionStore';
import { sumNutrients } from '../utils/metabolism';
import { addDays, shortDayLabel } from '../utils/date';
import { cn } from '../utils/common';

interface WeeklyChartProps {
  endDate: string;
  targetKcal: number;
}

/** Seçili günle biten son 7 günün kalori grafiği (bağımlılıksız SVG/CSS). */
export function WeeklyChart({ endDate, targetKcal }: WeeklyChartProps) {
  const logsByDate = useNutritionStore((s) => s.logsByDate);
  const setSelectedDate = useNutritionStore((s) => s.setSelectedDate);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(endDate, i - 6);
        const kcal = sumNutrients((logsByDate[date] ?? []).map((l) => l.nutrients)).kcal;
        return { date, kcal };
      }),
    [endDate, logsByDate],
  );

  const max = Math.max(targetKcal * 1.25, ...days.map((d) => d.kcal), 1);
  const logged = days.filter((d) => d.kcal > 0);
  const avg = logged.length ? logged.reduce((a, d) => a + d.kcal, 0) / logged.length : 0;
  const targetPct = (targetKcal / max) * 100;

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <BarChart3 className="size-4 text-emerald-400" /> Son 7 gün
        </h3>
        <span className="text-xs text-slate-400">
          Ort. <b className="text-slate-200">{Math.round(avg)}</b> kcal
        </span>
      </div>

      <div className="relative h-32">
        <div className="absolute inset-x-0 border-t border-dashed border-emerald-500/40" style={{ bottom: `${targetPct}%` }}>
          <span className="absolute -top-4 right-0 text-[10px] text-emerald-500/70">hedef</span>
        </div>
        <div className="flex h-full items-end gap-2">
          {days.map((d) => {
            const h = (d.kcal / max) * 100;
            const over = d.kcal > targetKcal;
            const selected = d.date === endDate;
            return (
              <button
                key={d.date}
                onClick={() => setSelectedDate(d.date)}
                className="group flex h-full flex-1 flex-col justify-end"
                title={`${d.date}: ${Math.round(d.kcal)} kcal`}
              >
                <div
                  className={cn(
                    'w-full rounded-t-md transition-all duration-700',
                    d.kcal === 0 ? 'bg-slate-800' : over ? 'bg-rose-600' : 'bg-emerald-500',
                    selected ? 'opacity-100' : 'opacity-60 group-hover:opacity-90',
                  )}
                  style={{ height: `${Math.max(h, 2)}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2">
        {days.map((d) => (
          <span key={d.date} className={cn('flex-1 text-center text-[10px] capitalize', d.date === endDate ? 'font-semibold text-slate-200' : 'text-slate-500')}>
            {shortDayLabel(d.date)}
          </span>
        ))}
      </div>
    </section>
  );
}
