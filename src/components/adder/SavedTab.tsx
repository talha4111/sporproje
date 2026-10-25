import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Filter, Loader2 } from 'lucide-react';
import type { FoodItem } from '../../types/nutrition';
import { db } from '../../db/localDb';
import { normalizeText } from '../../utils/common';
import { Segmented } from '../ui';
import { FoodRow } from './FoodRow';

type SavedFilter = 'favorites' | 'recent' | 'custom' | 'all';

const FILTERS: readonly { value: SavedFilter; label: string }[] = [
  { value: 'favorites', label: 'Favoriler' },
  { value: 'recent', label: 'Son' },
  { value: 'custom', label: 'Özel' },
  { value: 'all', label: 'Tümü' },
];

interface SavedTabProps {
  onSelect: (food: FoodItem) => void;
}

export function SavedTab({ onSelect }: SavedTabProps) {
  const [filter, setFilter] = useState<SavedFilter>('favorites');
  const [text, setText] = useState('');
  const foods = useLiveQuery(() => db.foods.toArray(), []);

  const list = useMemo(() => {
    if (!foods) return [];
    const q = normalizeText(text);
    let result = foods.filter((f) => {
      if (filter === 'favorites' && f.isFavorite !== 1) return false;
      if (filter === 'recent' && f.lastUsedAt === 0) return false;
      if (filter === 'custom' && f.source !== 'custom' && f.source !== 'vision') return false;
      return !q || f.searchName.includes(q) || (f.brand ? normalizeText(f.brand).includes(q) : false);
    });
    result =
      filter === 'recent'
        ? result.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        : result.sort((a, b) => b.isFavorite - a.isFavorite || a.name.localeCompare(b.name, 'tr'));
    return result;
  }, [foods, filter, text]);

  const handleDelete = (food: FoodItem) => {
    if (window.confirm(`"${food.name}" kayıtlı besinlerden silinsin mi? (Geçmiş öğün kayıtları etkilenmez.)`)) {
      void db.foods.delete(food.id);
    }
  };

  return (
    <div className="space-y-3">
      <Segmented value={filter} options={FILTERS} onChange={setFilter} />
      <div className="relative">
        <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Listede filtrele…" className="input pl-9" />
      </div>

      {!foods ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-slate-500" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
          Bu filtrede besin yok.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((f) => (
            <FoodRow key={f.id} food={f} onSelect={onSelect} onDelete={handleDelete} />
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-slate-500">{foods?.length ?? 0} besin cihazınızda kayıtlı · internetsiz çalışır</p>
    </div>
  );
}
