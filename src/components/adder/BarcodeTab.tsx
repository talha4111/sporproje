import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader2, PencilLine } from 'lucide-react';
import type { FoodItem } from '../../types/nutrition';
import { FoodApiError, getProductByBarcode, isAbortError } from '../../services/foodApi';

const BarcodeScanner = lazy(() =>
  import('../BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
);

interface BarcodeTabProps {
  onSelect: (food: FoodItem) => void;
  onManualEntry: (barcode: string) => void;
}

export function BarcodeTab({ onSelect, onManualEntry }: BarcodeTabProps) {
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ code: string; message: string; notFound: boolean } | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const handleDetected = useCallback(
    async (code: string) => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setFailed(null);
      setLookingUp(code);
      try {
        const food = await getProductByBarcode(code, ctrl.signal);
        onSelect(food);
      } catch (err) {
        if (isAbortError(err)) return;
        const message = err instanceof FoodApiError ? err.message : 'Ürün sorgulanırken hata oluştu.';
        setFailed({ code, message, notFound: err instanceof FoodApiError && err.kind === 'not_found' });
      } finally {
        if (ctrlRef.current === ctrl) setLookingUp(null);
      }
    },
    [onSelect],
  );

  return (
    <div className="space-y-3">
      <Suspense
        fallback={
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-400">
            <Loader2 className="mr-2 size-5 animate-spin text-emerald-400" /> Kamera modülü yükleniyor…
          </div>
        }
      >
        <BarcodeScanner onDetected={(c) => void handleDetected(c)} paused={lookingUp !== null} />
      </Suspense>

      {lookingUp && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-800/60 px-3 py-2.5 text-sm text-slate-300">
          <Loader2 className="size-4 animate-spin text-emerald-400" /> <span className="font-mono">{lookingUp}</span> sorgulanıyor…
        </div>
      )}

      {failed && (
        <div className="space-y-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {failed.message}
          </p>
          {failed.notFound && (
            <button onClick={() => onManualEntry(failed.code)} className="btn-secondary w-full py-1.5 text-xs">
              <PencilLine className="size-4" /> Bu barkodla manuel ekle
            </button>
          )}
        </div>
      )}

      <p className="text-center text-[11px] text-slate-500">
        Taranan ürünler cihazınıza kaydedilir; aynı ürünü tekrar taradığınızda internet gerekmez.
      </p>
    </div>
  );
}
