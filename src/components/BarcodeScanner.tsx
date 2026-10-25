import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, Keyboard, Loader2, ScanLine } from 'lucide-react';
import { isValidBarcode } from '../services/foodApi';

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  /** Dışarıdan duraklatma (örn. ürün aranırken). */
  paused?: boolean;
}

type ScannerStatus = 'starting' | 'scanning' | 'error' | 'insecure';

/** Yalnızca market ürün barkodları → daha hızlı ve isabetli tarama. */
const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

function describeCameraError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/NotAllowed|Permission/i.test(msg)) return 'Kamera izni reddedildi. Tarayıcı ayarlarından izin verin.';
  if (/NotFound|Requested device not found/i.test(msg)) return 'Kamera bulunamadı.';
  if (/NotReadable|in use/i.test(msg)) return 'Kamera başka bir uygulama tarafından kullanılıyor.';
  return 'Canlı kamera başlatılamadı.';
}

export function BarcodeScanner({ onDetected, paused = false }: BarcodeScannerProps) {
  const regionId = `scanner-${useId().replace(/:/g, '')}`;
  const fileRegionId = `scanner-file-${useId().replace(/:/g, '')}`;
  const [status, setStatus] = useState<ScannerStatus>(() => (window.isSecureContext ? 'starting' : 'insecure'));
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [scanningFile, setScanningFile] = useState(false);
  const [manual, setManual] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // En güncel callback/pause değerlerini kamera döngüsünü yeniden başlatmadan oku.
  const onDetectedRef = useRef(onDetected);
  const pausedRef = useRef(paused);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  useEffect(() => {
    onDetectedRef.current = onDetected;
    pausedRef.current = paused;
  }, [onDetected, paused]);

  useEffect(() => {
    if (!window.isSecureContext) return;
    let cancelled = false;
    const scanner = new Html5Qrcode(regionId, {
      formatsToSupport: FORMATS,
      useBarCodeDetectorIfSupported: true, // Destekleyen tarayıcılarda yerel BarcodeDetector API
      verbose: false,
    });

    const startPromise = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 320), height: Math.min(h * 0.45, 160) }) },
        (text) => {
          if (pausedRef.current) return;
          const now = Date.now();
          const last = lastCodeRef.current;
          // Aynı kodu art arda tetiklemeyi engelle
          if (last && last.code === text && now - last.at < 3000) return;
          lastCodeRef.current = { code: text, at: now };
          navigator.vibrate?.(80);
          onDetectedRef.current(text);
        },
        () => {
          /* Her karede "bulunamadı" hatası gelir; yok sayılır. */
        },
      )
      .then(() => {
        if (!cancelled) setStatus('scanning');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeCameraError(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      startPromise
        .then(() => (scanner.isScanning ? scanner.stop() : undefined))
        .then(() => scanner.clear())
        .catch(() => undefined);
    };
  }, [regionId]);

  /** HTTP üzerinde bile telefonda çalışan yerel kamera fotoğrafından barkod çözümleme */
  const handlePhotoScan = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    setScanningFile(true);
    try {
      const fileScanner = new Html5Qrcode(fileRegionId, {
        formatsToSupport: FORMATS,
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      const decoded = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      navigator.vibrate?.(80);
      onDetected(decoded.trim());
    } catch {
      setFileError('Fotoğrafta barkod okunamadı. Barkodu net odaklayarak tekrar çekin veya aşağıdan elle girin.');
    } finally {
      setScanningFile(false);
    }
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const code = manual.trim();
    if (isValidBarcode(code)) onDetected(code);
  };

  return (
    <div className="space-y-3">
      {/* Dosyadan barkod okuma için gizli kapsayıcı ve input */}
      <div id={fileRegionId} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handlePhotoScan(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-800 bg-black">
        <div id={regionId} className="scanner-region size-full" />

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="size-6 animate-spin" /> Kamera başlatılıyor…
          </div>
        )}
        {(status === 'error' || status === 'insecure') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-sm text-slate-300">
            <CameraOff className="size-8 text-amber-400" />
            <p className="max-w-xs text-xs text-slate-400">
              {status === 'insecure'
                ? 'Canlı video akışı HTTP bağlantısında kısıtlıdır; ancak telefon kameranızla barkodun fotoğrafını çekerek hemen okutabilirsiniz:'
                : error}
            </p>
            <button
              type="button"
              disabled={scanningFile || paused}
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary py-2.5 text-xs shadow-lg"
            >
              {scanningFile ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              Telefon Kamerasıyla Barkodu Çek
            </button>
          </div>
        )}
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-emerald-300">
              <ScanLine className="size-3.5" /> {paused ? 'Ürün aranıyor…' : 'Barkodu çerçeveye hizalayın'}
            </span>
          </div>
        )}
      </div>

      {status === 'scanning' && (
        <button
          type="button"
          disabled={scanningFile || paused}
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary w-full py-2 text-xs"
        >
          {scanningFile ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Netlemiyor mu? Telefon Kamerasıyla Fotoğraf Çekerek Oku
        </button>
      )}

      {fileError && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{fileError}</p>}

      <form onSubmit={submitManual} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
            placeholder="Barkodu elle girin (8–14 hane)"
            className="input pl-9"
            maxLength={14}
          />
        </div>
        <button type="submit" disabled={!isValidBarcode(manual) || paused} className="btn-secondary">
          Sorgula
        </button>
      </form>
    </div>
  );
}
