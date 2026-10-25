import { Globe, Star, Trash2, UserPen, Database, Sparkles } from 'lucide-react';
import type { FoodItem } from '../../types/nutrition';
import { toggleFavorite } from '../../db/localDb';
import { formatAmount } from '../../utils/metabolism';
import { cn } from '../../utils/common';

interface FoodRowProps {
  food: FoodItem;
  onSelect: (food: FoodItem) => void;
  onDelete?: (food: FoodItem) => void;
  /** Kayıt veritabanında değilse (örn. kaydedilmemiş manuel giriş) favori düğmesini gizle. */
  showFavorite?: boolean;
}

const SOURCE_ICON = {
  seed: { Icon: Database, label: 'Temel besin', cls: 'text-emerald-400' },
  api: { Icon: Globe, label: 'Open Food Facts', cls: 'text-sky-400' },
  custom: { Icon: UserPen, label: 'Özel besin', cls: 'text-violet-400' },
  vision: { Icon: Sparkles, label: 'AI Kamera analizi', cls: 'text-amber-400' },
} as const;

export function FoodRow({ food, onSelect, onDelete, showFavorite = true }: FoodRowProps) {
  const { Icon, label, cls } = SOURCE_ICON[food.source];
  const p = food.per100g;

  return (
    <div className="group flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2 transition-colors hover:border-slate-700 hover:bg-slate-800/40">
      <button onClick={() => onSelect(food)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {food.imageUrl ? (
          <img src={food.imageUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg bg-white object-contain" />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800">
            <Icon className={cn('size-4', cls)} aria-label={label} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{food.name}</p>
          <p className="truncate text-[11px] text-slate-500">
            {food.brand && <span className="text-slate-400">{food.brand} · </span>}
            100 g: <b className="text-slate-300">{formatAmount(p.kcal, 0)} kcal</b> · P {formatAmount(p.protein)} · K{' '}
            {formatAmount(p.carbs)} · Y {formatAmount(p.fat)}
          </p>
        </div>
      </button>

      {showFavorite && (
        <button
          onClick={() => void toggleFavorite(food.id)}
          className="btn-icon size-8"
          aria-label={food.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
        >
          <Star className={cn('size-4', food.isFavorite ? 'fill-amber-400 text-amber-400' : '')} />
        </button>
      )}
      {onDelete && food.source !== 'seed' && (
        <button onClick={() => onDelete(food)} className="btn-icon size-8 hover:text-rose-400" aria-label="Sil">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
