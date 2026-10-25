import { AlertTriangle, Flame } from 'lucide-react';
import type { MacroTargets, Nutrients } from '../types/nutrition';
import { formatAmount } from '../utils/metabolism';
import { cn } from '../utils/common';
import { ProgressBar } from './ui';

interface MacroDashboardProps {
  targets: MacroTargets;
  consumed: Nutrients;
}

interface MacroRowConfig {
  key: 'protein' | 'carbs' | 'fat';
  label: string;
  color: string;
  text: string;
}

const MACROS: readonly MacroRowConfig[] = [
  { key: 'protein', label: 'Protein', color: 'bg-sky-500', text: 'text-sky-400' },
  { key: 'carbs', label: 'Karbonhidrat', color: 'bg-amber-500', text: 'text-amber-400' },
  { key: 'fat', label: 'Yağ', color: 'bg-violet-500', text: 'text-violet-400' },
];

function Remaining({ target, value, unit }: { target: number; value: number; unit: string }) {
  const diff = target - value;
  return diff >= 0 ? (
    <span className="text-slate-400">
      Kalan <span className="font-semibold text-slate-200">{formatAmount(diff, 0)}</span> {unit}
    </span>
  ) : (
    <span className="font-semibold text-rose-400">
      {formatAmount(-diff, 0)} {unit} fazla
    </span>
  );
}

export function MacroDashboard({ targets, consumed }: MacroDashboardProps) {
  const kcalOver = consumed.kcal > targets.kcal;

  return (
    <section className="card p-5">
      {/* Kalori */}
      <div className="mb-5">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={cn('flex size-9 items-center justify-center rounded-xl', kcalOver ? 'bg-rose-600/15 text-rose-400' : 'bg-emerald-600/15 text-emerald-400')}>
              <Flame className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Kalori</p>
              <p className="text-2xl font-bold tabular-nums text-slate-50">
                {formatAmount(consumed.kcal, 0)}
                <span className="text-sm font-medium text-slate-500"> / {formatAmount(targets.kcal, 0)} kcal</span>
              </p>
            </div>
          </div>
          <p className="text-right text-sm">
            <Remaining target={targets.kcal} value={consumed.kcal} unit="kcal" />
          </p>
        </div>
        <ProgressBar value={consumed.kcal} max={targets.kcal} colorClass="bg-emerald-500" className="h-3" />
      </div>

      {/* Makrolar */}
      <div className="grid gap-4 sm:grid-cols-3">
        {MACROS.map((m) => {
          const value = consumed[m.key];
          const target = targets[m.key];
          return (
            <div key={m.key}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className={cn('font-medium', m.text)}>{m.label}</span>
                <span className="tabular-nums text-slate-300">
                  {formatAmount(value, 0)}
                  <span className="text-slate-500"> / {target} g</span>
                </span>
              </div>
              <ProgressBar value={value} max={target} colorClass={m.color} />
              <p className="mt-1 text-[11px]">
                <Remaining target={target} value={value} unit="g" />
              </p>
            </div>
          );
        })}
      </div>

      {/* Mikro detaylar */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <span>Lif: <b className="text-slate-200">{formatAmount(consumed.fiber)} g</b></span>
        <span>Şeker: <b className="text-slate-200">{formatAmount(consumed.sugar)} g</b></span>
        <span>Tuz: <b className="text-slate-200">{formatAmount(consumed.salt)} g</b></span>
        <span className="ml-auto text-slate-500">
          BMR {targets.bmr} · TDEE {targets.tdee} kcal
        </span>
      </div>

      {targets.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {targets.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
