import { useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import type { ActivityLevel, Goal, MacroMode, MacroPercentages, Sex, UserProfile } from '../types/nutrition';
import { useNutritionStore } from '../store/useNutritionStore';
import { ACTIVITY_LABELS, GOAL_LABELS, calculateTargets, percentageSum } from '../utils/metabolism';
import { BackupError, exportBackup, parseAndImportBackup } from '../utils/backup';
import { cn, toNumber } from '../utils/common';
import { Field, Modal, Segmented } from './ui';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const SEX_OPTIONS = [
  { value: 'male', label: 'Erkek' },
  { value: 'female', label: 'Kadın' },
] as const satisfies readonly { value: Sex; label: string }[];

const MODE_OPTIONS = [
  { value: 'bodyweight', label: 'Vücut ağırlığı (sporcu)' },
  { value: 'percentage', label: 'Yüzde dağılımı' },
] as const satisfies readonly { value: MacroMode; label: string }[];

const GOAL_OPTIONS = (Object.keys(GOAL_LABELS) as Goal[]).map((g) => ({ value: g, label: GOAL_LABELS[g].split(' (')[0] }));

/** Sayı alanları için metin taslağı (kullanıcı yazarken "7" → "75" geçişine izin verir). */
type NumKey = 'age' | 'heightCm' | 'weightKg' | 'proteinPerKg' | 'waterTargetMl';
type Draft = Omit<UserProfile, NumKey | 'percentages'> &
  Record<NumKey, string> & { percentages: Record<keyof MacroPercentages, string> };

const toDraft = (p: UserProfile): Draft => ({
  ...p,
  age: String(p.age),
  heightCm: String(p.heightCm),
  weightKg: String(p.weightKg),
  proteinPerKg: String(p.proteinPerKg),
  waterTargetMl: String(p.waterTargetMl),
  percentages: {
    protein: String(p.percentages.protein),
    carbs: String(p.percentages.carbs),
    fat: String(p.percentages.fat),
  },
});

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const fromDraft = (d: Draft): UserProfile => ({
  ...d,
  name: d.name.trim(),
  age: clamp(Math.round(toNumber(d.age, 25)), 10, 100),
  heightCm: clamp(toNumber(d.heightCm, 175), 100, 250),
  weightKg: clamp(toNumber(d.weightKg, 75), 30, 300),
  proteinPerKg: clamp(toNumber(d.proteinPerKg, 2), 0.8, 3.5),
  waterTargetMl: clamp(Math.round(toNumber(d.waterTargetMl, 3000)), 500, 8000),
  percentages: {
    protein: clamp(toNumber(d.percentages.protein), 0, 100),
    carbs: clamp(toNumber(d.percentages.carbs), 0, 100),
    fat: clamp(toNumber(d.percentages.fat), 0, 100),
  },
});

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const profile = useNutritionStore((s) => s.profile);
  const onboarded = useNutritionStore((s) => s.onboarded);
  const setProfile = useNutritionStore((s) => s.setProfile);
  const importData = useNutritionStore((s) => s.importData);
  const resetAll = useNutritionStore((s) => s.resetAll);

  // Modal her açıldığında güncel profilden taslak oluştur (key ile yeniden mount edilir).
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => fromDraft(draft), [draft]);
  const targets = useMemo(() => calculateTargets(parsed), [parsed]);
  const pctSum = percentageSum(parsed.percentages);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updatePct = (key: keyof MacroPercentages, value: string) =>
    setDraft((d) => ({ ...d, percentages: { ...d.percentages, [key]: value } }));

  const save = () => {
    setProfile(parsed);
    onClose();
  };

  const handleExport = async () => {
    const s = useNutritionStore.getState();
    await exportBackup({
      profile: s.profile,
      onboarded: s.onboarded,
      logsByDate: s.logsByDate,
      waterByDate: s.waterByDate,
      weightLog: s.weightLog,
    });
    setMessage({ type: 'ok', text: 'Yedek dosyası indirildi.' });
  };

  const handleImport = async (file: File) => {
    try {
      const data = await parseAndImportBackup(await file.text());
      importData(data);
      setDraft(toDraft(data.profile));
      const days = Object.keys(data.logsByDate).length;
      setMessage({ type: 'ok', text: `Yedek geri yüklendi (${days} günlük kayıt).` });
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof BackupError ? err.message : 'Yedek okunamadı.' });
    }
  };

  const handleReset = () => {
    if (window.confirm('Tüm öğün kayıtları, su/kilo geçmişi ve profil silinecek. Emin misiniz?')) {
      resetAll();
      setDraft(toDraft(useNutritionStore.getState().profile));
      setMessage({ type: 'ok', text: 'Tüm veriler sıfırlandı.' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={onboarded}
      title={onboarded ? 'Profil & Hedefler' : 'Hoş geldin! Hedeflerini belirleyelim'}
      footer={
        <button onClick={save} className="btn-primary w-full">
          Kaydet · {targets.kcal} kcal / gün
        </button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Adın" className="col-span-2">
            <input value={draft.name} onChange={(e) => update('name', e.target.value)} className="input" placeholder="opsiyonel" />
          </Field>
          <Field label="Cinsiyet" className="col-span-2">
            <Segmented value={draft.sex} options={SEX_OPTIONS} onChange={(v) => update('sex', v)} />
          </Field>
          <Field label="Yaş">
            <input inputMode="numeric" value={draft.age} onChange={(e) => update('age', e.target.value)} className="input" />
          </Field>
          <Field label="Boy (cm)">
            <input inputMode="decimal" value={draft.heightCm} onChange={(e) => update('heightCm', e.target.value)} className="input" />
          </Field>
          <Field label="Kilo (kg)">
            <input inputMode="decimal" value={draft.weightKg} onChange={(e) => update('weightKg', e.target.value)} className="input" />
          </Field>
          <Field label="Su hedefi (ml)">
            <input inputMode="numeric" value={draft.waterTargetMl} onChange={(e) => update('waterTargetMl', e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Aktivite seviyesi">
          <select
            value={draft.activityLevel}
            onChange={(e) => update('activityLevel', e.target.value as ActivityLevel)}
            className="input"
          >
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Hedef" hint="Kilo ver: TDEE −%20 · Kilo al: TDEE +%15">
          <Segmented value={draft.goal} options={GOAL_OPTIONS} onChange={(v) => update('goal', v)} />
        </Field>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <Field label="Makro hesaplama modu">
            <Segmented value={draft.macroMode} options={MODE_OPTIONS} onChange={(v) => update('macroMode', v)} />
          </Field>

          {draft.macroMode === 'bodyweight' ? (
            <Field label="Kg başına protein (g)" hint="Yağ = kalorinin %25'i, karbonhidrat = kalan kalori">
              <input inputMode="decimal" value={draft.proteinPerKg} onChange={(e) => update('proteinPerKg', e.target.value)} className="input" />
            </Field>
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-2">
                {(['protein', 'carbs', 'fat'] as const).map((k) => (
                  <Field key={k} label={{ protein: 'Protein %', carbs: 'Karbonhidrat %', fat: 'Yağ %' }[k]}>
                    <input inputMode="numeric" value={draft.percentages[k]} onChange={(e) => updatePct(k, e.target.value)} className="input" />
                  </Field>
                ))}
              </div>
              <p className={cn('mt-1.5 text-xs', Math.round(pctSum) === 100 ? 'text-emerald-400' : 'text-amber-400')}>
                Toplam: %{Math.round(pctSum)} {Math.round(pctSum) !== 100 && '— %100 olmalı (otomatik normalize edilir)'}
              </p>
            </div>
          )}
        </div>

        {/* Canlı hedef önizlemesi */}
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[
            ['BMR', targets.bmr, 'kcal'],
            ['TDEE', targets.tdee, 'kcal'],
            ['Hedef', targets.kcal, 'kcal'],
            ['Protein', targets.protein, 'g'],
            ['Karb.', targets.carbs, 'g'],
            ['Yağ', targets.fat, 'g'],
          ].map(([label, value, unit]) => (
            <div key={label} className="rounded-lg bg-slate-950 px-1 py-2">
              <p className="text-sm font-bold tabular-nums text-slate-100">{value}</p>
              <p className="text-[10px] text-slate-500">
                {label} ({unit})
              </p>
            </div>
          ))}
        </div>
        {targets.warnings.map((w) => (
          <p key={w} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {w}
          </p>
        ))}

        {onboarded && (
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Veri yedekleme</p>
            <p className="text-[11px] text-slate-500">
              Veriler yalnızca bu tarayıcıda saklanır. Tarayıcı verisi temizlenirse kaybolur — düzenli yedek alın.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => void handleExport()} className="btn-secondary px-2 text-xs">
                <Download className="size-4" /> Dışa aktar
              </button>
              <button onClick={() => fileRef.current?.click()} className="btn-secondary px-2 text-xs">
                <Upload className="size-4" /> İçe aktar
              </button>
              <button onClick={handleReset} className="btn-secondary px-2 text-xs text-rose-300 hover:bg-rose-950">
                <RotateCcw className="size-4" /> Sıfırla
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = '';
              }}
            />
            {message && (
              <p className={cn('text-xs', message.type === 'ok' ? 'text-emerald-400' : 'text-rose-400')}>{message.text}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
