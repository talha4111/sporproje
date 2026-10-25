import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { FoodItem, Nutrients, ServingPreset } from '../../types/nutrition';
import { upsertFood } from '../../db/localDb';
import { kcalFromMacros } from '../../utils/metabolism';
import { createId, normalizeText, toNumber } from '../../utils/common';
import { Field } from '../ui';

interface ManualTabProps {
  initialBarcode?: string;
  onCreate: (food: FoodItem, savedToDb: boolean) => void;
}

type NumField = keyof Nutrients;

const MACRO_FIELDS: readonly { key: NumField; label: string; required?: boolean }[] = [
  { key: 'protein', label: 'Protein (g)', required: true },
  { key: 'carbs', label: 'Karbonhidrat (g)', required: true },
  { key: 'fat', label: 'Yağ (g)', required: true },
  { key: 'fiber', label: 'Lif (g)' },
  { key: 'sugar', label: 'Şeker (g)' },
  { key: 'salt', label: 'Tuz (g)' },
];

type FormValues = Record<NumField, string>;

const EMPTY_FORM: FormValues = { kcal: '', protein: '', carbs: '', fat: '', fiber: '', sugar: '', salt: '' };

export function ManualTab({ initialBarcode, onCreate }: ManualTabProps) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [servingLabel, setServingLabel] = useState('');
  const [servingGrams, setServingGrams] = useState('');
  const [save, setSave] = useState(true);

  const num = (k: NumField) => Math.max(0, toNumber(values[k]));
  const autoKcal = Math.round(kcalFromMacros(num('protein'), num('carbs'), num('fat')));
  const hasKcal = values.kcal.trim() !== '';

  const set = (k: NumField) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const servings: ServingPreset[] = [];
    const sg = toNumber(servingGrams);
    if (sg > 0) servings.push({ label: servingLabel.trim() || '1 porsiyon', grams: sg });

    const food: FoodItem = {
      id: createId('custom'),
      name: trimmed,
      brand: brand.trim() || undefined,
      barcode: /^\d{8,14}$/.test(barcode) ? barcode : undefined,
      per100g: {
        kcal: hasKcal ? num('kcal') : autoKcal,
        protein: num('protein'),
        carbs: num('carbs'),
        fat: num('fat'),
        fiber: num('fiber'),
        sugar: num('sugar'),
        salt: num('salt'),
      },
      servings,
      source: 'custom',
      isFavorite: save ? 1 : 0,
      searchName: normalizeText(trimmed),
      createdAt: Date.now(),
      lastUsedAt: 0,
    };
    if (save) await upsertFood(food);
    onCreate(food, save);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Besin adı *" className="sm:col-span-2">
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="örn. Ev yapımı mercimek çorbası" />
        </Field>
        <Field label="Marka (opsiyonel)">
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input" />
        </Field>
        <Field label="Barkod (opsiyonel)">
          <input
            inputMode="numeric"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
            maxLength={14}
            className="input font-mono"
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">100 g için besin değerleri</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Kalori (kcal)" hint={hasKcal ? undefined : `Boş bırakılırsa: ${autoKcal} kcal`}>
            <input inputMode="decimal" value={values.kcal} onChange={(e) => set('kcal')(e.target.value)} placeholder={String(autoKcal)} className="input" />
          </Field>
          {MACRO_FIELDS.map((f) => (
            <Field key={f.key} label={f.label + (f.required ? ' *' : '')}>
              <input
                inputMode="decimal"
                required={f.required}
                value={values[f.key]}
                onChange={(e) => set(f.key)(e.target.value)}
                placeholder="0"
                className="input"
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Porsiyon adı (opsiyonel)">
          <input value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} placeholder="örn. 1 kase" className="input" />
        </Field>
        <Field label="Porsiyon gramajı">
          <input inputMode="decimal" value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} placeholder="g" className="input" />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="size-4 accent-emerald-500" />
        Kayıtlı besinlerime ekle (sonra tekrar kullanmak için)
      </label>

      <button type="submit" className="btn-primary w-full">
        <Save className="size-4" /> Devam et — miktar seç
      </button>
    </form>
  );
}
