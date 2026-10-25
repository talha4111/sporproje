import { useCallback, useEffect, useState } from 'react';
import { BookmarkCheck, CheckCircle2, PencilLine, ScanBarcode, Search, Sparkles } from 'lucide-react';
import type { FoodItem, MealCategory } from '../types/nutrition';
import { MEAL_CATEGORY_LABELS } from '../types/nutrition';
import { markFoodUsed, upsertFood } from '../db/localDb';
import { useNutritionStore } from '../store/useNutritionStore';
import { formatDateLabel } from '../utils/date';
import { cn } from '../utils/common';
import { Modal } from './ui';
import { SearchTab } from './adder/SearchTab';
import { BarcodeTab } from './adder/BarcodeTab';
import { SavedTab } from './adder/SavedTab';
import { ManualTab } from './adder/ManualTab';
import { VisionTab } from './adder/VisionTab';
import { PortionPanel } from './adder/PortionPanel';

export type AdderTab = 'vision' | 'search' | 'barcode' | 'saved' | 'manual';

const TABS: readonly { id: AdderTab; label: string; Icon: typeof Search }[] = [
  { id: 'vision', label: 'AI Kamera', Icon: Sparkles },
  { id: 'search', label: 'API Arama', Icon: Search },
  { id: 'barcode', label: 'Barkod Tara', Icon: ScanBarcode },
  { id: 'saved', label: 'Kayıtlı', Icon: BookmarkCheck },
  { id: 'manual', label: 'Manuel', Icon: PencilLine },
];

interface FoodAdderModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  initialCategory: MealCategory;
  initialTab?: AdderTab;
}

interface Selection {
  food: FoodItem;
  /** IndexedDB'de kayıtlı mı (favori düğmesi için). */
  persisted: boolean;
}

export function FoodAdderModal({
  open,
  onClose,
  date,
  initialCategory,
  initialTab = 'saved',
}: FoodAdderModalProps) {
  const addLog = useNutritionStore((s) => s.addLog);
  const [tab, setTab] = useState<AdderTab>(initialTab);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [manualBarcode, setManualBarcode] = useState<string | undefined>();
  const [toast, setToast] = useState('');

  // Açılış sekmesi dışarıdan değiştiğinde (örn. AI Kamera kısayol düğmesi) senkronize et
  const [prevInitialTab, setPrevInitialTab] = useState<AdderTab>(initialTab);
  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setTab(initialTab);
  }

  const handleClose = () => {
    setSelection(null);
    setToast('');
    onClose();
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const select = useCallback((food: FoodItem) => setSelection({ food, persisted: true }), []);

  const handleAdd = (grams: number, category: MealCategory) => {
    if (!selection) return;
    addLog(selection.food, grams, category, date);
    if (selection.persisted) void markFoodUsed(selection.food.id);
    setToast(`${selection.food.name} (${grams} g) → ${MEAL_CATEGORY_LABELS[category]}`);
    setSelection(null);
  };

  const handleAddPlate = async (
    items: Array<{ food: FoodItem; grams: number }>,
    category: MealCategory,
    saveToDb: boolean,
  ) => {
    for (const entry of items) {
      if (saveToDb) {
        await upsertFood(entry.food);
      }
      addLog(entry.food, entry.grams, category, date);
    }
    setToast(`${items.length} besin (${MEAL_CATEGORY_LABELS[category]}) tabağa eklendi!`);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      className="sm:max-w-2xl"
      title={
        <span className="flex flex-col">
          Besin Ekle
          <span className="text-xs font-normal text-slate-500 capitalize">{formatDateLabel(date)}</span>
        </span>
      }
    >
      {toast && (
        <div className="animate-fade-in mb-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0" /> <span className="truncate">Eklendi: {toast}</span>
        </div>
      )}

      {selection ? (
        <PortionPanel
          key={selection.food.id}
          food={selection.food}
          initialCategory={initialCategory}
          canFavorite={selection.persisted}
          onBack={() => setSelection(null)}
          onAdd={handleAdd}
        />
      ) : (
        <>
          <div className="-mx-1 mb-4 grid grid-cols-5 gap-1 rounded-xl bg-slate-950 p-1">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors sm:flex-row sm:justify-center sm:text-xs',
                  tab === id
                    ? id === 'vision'
                      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                      : 'bg-slate-800 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <Icon className={cn('size-4', id === 'vision' && tab !== id && 'text-amber-400')} />{' '}
                <span className="leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {tab === 'vision' && (
            <VisionTab
              initialCategory={initialCategory}
              onAddPlate={(items, category, save) => void handleAddPlate(items, category, save)}
            />
          )}
          {tab === 'search' && <SearchTab onSelect={select} />}
          {tab === 'barcode' && (
            <BarcodeTab
              onSelect={select}
              onManualEntry={(code) => {
                setManualBarcode(code);
                setTab('manual');
              }}
            />
          )}
          {tab === 'saved' && <SavedTab onSelect={select} />}
          {tab === 'manual' && (
            <ManualTab
              key={manualBarcode ?? 'manual'}
              initialBarcode={manualBarcode}
              onCreate={(food, saved) => setSelection({ food, persisted: saved })}
            />
          )}
        </>
      )}
    </Modal>
  );
}
