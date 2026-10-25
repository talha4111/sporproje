import { useMemo, useState, type FormEvent } from 'react';
import { Scale, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useNutritionStore } from '../store/useNutritionStore';
import { formatAmount } from '../utils/metabolism';
import { parseDateKey } from '../utils/date';
import { toNumber } from '../utils/common';

export function WeightTracker({ date }: { date: string }) {
  const weightLog = useNutritionStore((s) => s.weightLog);
  const logWeight = useNutritionStore((s) => s.logWeight);
  const removeWeight = useNutritionStore((s) => s.removeWeight);
  const todays = weightLog.find((w) => w.date === date);
  const [text, setText] = useState('');

  const recent = weightLog.slice(-14);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const delta = first && last && recent.length > 1 ? last.weightKg - first.weightKg : 0;

  // Basit SVG çizgi grafiği
  const path = useMemo(() => {
    if (recent.length < 2) return '';
    const ws = recent.map((w) => w.weightKg);
    const min = Math.min(...ws) - 0.5;
    const max = Math.max(...ws) + 0.5;
    return recent
      .map((w, i) => {
        const x = (i / (recent.length - 1)) * 100;
        const y = 100 - ((w.weightKg - min) / (max - min)) * 100;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [recent]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const kg = toNumber(text);
    if (kg >= 30 && kg <= 300) {
      logWeight(date, Math.round(kg * 10) / 10);
      setText('');
    }
  };

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Scale className="size-4 text-violet-400" /> Kilo
        </h3>
        {recent.length > 1 && (
          <span className={`flex items-center gap-1 text-xs ${delta <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {delta <= 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
            {delta > 0 ? '+' : ''}
            {formatAmount(delta)} kg ({recent.length} ölçüm)
          </span>
        )}
      </div>

      {path && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mb-2 h-14 w-full overflow-visible">
          <path d={path} fill="none" stroke="rgb(167 139 250)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      {todays ? (
        <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2 text-sm">
          <span className="text-slate-400">
            {parseDateKey(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}:{' '}
            <b className="text-slate-100">{formatAmount(todays.weightKg)} kg</b>
          </span>
          <button onClick={() => removeWeight(date)} className="btn-icon size-7" aria-label="Ölçümü sil">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Bu günün tartısı (kg)" className="input py-1.5" />
          <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
            Kaydet
          </button>
        </form>
      )}
      <p className="mt-2 text-[11px] text-slate-500">En güncel tartı profil kilonuzu ve makro hedeflerinizi otomatik günceller.</p>
    </section>
  );
}
